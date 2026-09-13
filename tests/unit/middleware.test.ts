import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../packages/core/src/index.js";
import { Request } from "../../packages/core/src/request.js";
import { Response } from "../../packages/core/src/response.js";

type InternalApp = { handleRequest: (req: Request, res: Response) => Promise<void> };

function createMockReqRes(
  url = "/",
  method = "GET",
): {
  req: Request;
  res: Response;
  resMock: Record<string, unknown>;
} {
  const req = new Request({ method, url } as never);
  let endData = "";
  const resMock = {
    statusCode: 200,
    headersSent: false,
    setHeader: vi.fn(),
    getHeader: vi.fn(),
    end: vi.fn((data) => {
      endData = data;
    }),
    get endData() {
      return endData;
    },
  };
  const res = new Response(resMock as never);
  return { req, res, resMock };
}

describe("Middleware Pipeline", () => {
  it("should execute single middleware", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.use(async (_req, _res, next) => {
      logs.push("mw1");
      await next();
    });

    app.get("/", (_req, res) => {
      logs.push("handler");
      res.json({ ok: true });
    });

    const { req, res } = createMockReqRes("/");
    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(logs).toEqual(["mw1", "handler"]);
  });

  it("should execute multiple middleware in registration order", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.use(async (_req, _res, next) => {
      logs.push("mw1");
      await next();
    });

    app.use(async (_req, _res, next) => {
      logs.push("mw2");
      await next();
    });

    app.use(async (_req, _res, next) => {
      logs.push("mw3");
      await next();
    });

    app.get("/", (_req, res) => {
      logs.push("handler");
      res.json({ ok: true });
    });

    const { req, res } = createMockReqRes("/");
    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(logs).toEqual(["mw1", "mw2", "mw3", "handler"]);
  });

  it("should execute middleware code before and after next() in expected order", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.use(async (_req, _res, next) => {
      logs.push("mw1 before");
      await next();
      logs.push("mw1 after");
    });

    app.use(async (_req, _res, next) => {
      logs.push("mw2 before");
      await next();
      logs.push("mw2 after");
    });

    app.get("/", (_req, res) => {
      logs.push("handler");
      res.json({ ok: true });
    });

    const { req, res } = createMockReqRes("/");
    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(logs).toEqual(["mw1 before", "mw2 before", "handler", "mw2 after", "mw1 after"]);
  });

  it("should support middleware that terminates early without calling next()", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.use((_req, res) => {
      logs.push("mw1 terminated");
      res.status(401).json({ error: "Unauthorized" });
    });

    app.use(async (_req, _res, next) => {
      logs.push("mw2");
      await next();
    });

    app.get("/", (_req, res) => {
      logs.push("handler");
      res.json({ ok: true });
    });

    const { req, res, resMock } = createMockReqRes("/");
    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(logs).toEqual(["mw1 terminated"]);
    expect(resMock.statusCode).toBe(401);
  });

  it("should work with synchronous middleware", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.use((_req, _res, next) => {
      logs.push("sync mw");
      void next();
    });

    app.get("/", (_req, res) => {
      logs.push("handler");
      res.json({ ok: true });
    });

    const { req, res } = createMockReqRes("/");
    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(logs).toEqual(["sync mw", "handler"]);
  });

  it("should work with async middleware", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.use(async (_req, _res, next) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      logs.push("async mw");
      await next();
    });

    app.get("/", (_req, res) => {
      logs.push("handler");
      res.json({ ok: true });
    });

    const { req, res } = createMockReqRes("/");
    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(logs).toEqual(["async mw", "handler"]);
  });

  it("should catch synchronous thrown error in middleware and reach application error handler", async () => {
    const app = createApp();

    app.use(() => {
      throw new Error("Sync middleware error");
    });

    const { req, res, resMock } = createMockReqRes("/");
    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(resMock.statusCode).toBe(500);
    expect(resMock.end).toHaveBeenCalled();
  });

  it("should catch rejected promise in middleware and reach application error handler", async () => {
    const app = createApp();

    app.use(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error("Async middleware rejected error");
    });

    const { req, res, resMock } = createMockReqRes("/");
    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(resMock.statusCode).toBe(500);
    expect(resMock.end).toHaveBeenCalled();
  });

  describe("Middleware Registration Scopes", () => {
    it("should execute path-specific middleware only for matching prefix", async () => {
      const app = createApp();
      const logs: string[] = [];

      app.use("/api", async (_req, _res, next) => {
        logs.push("api-mw");
        await next();
      });

      app.get("/api/users", (_req, res) => {
        logs.push("api-users-handler");
        res.json({ ok: true });
      });

      app.get("/web/home", (_req, res) => {
        logs.push("web-home-handler");
        res.json({ ok: true });
      });

      // Request to /api/users
      const { req: req1, res: res1 } = createMockReqRes("/api/users");
      await (app as unknown as InternalApp).handleRequest(req1, res1);
      expect(logs).toEqual(["api-mw", "api-users-handler"]);

      // Request to /web/home (should NOT run /api middleware)
      logs.length = 0;
      const { req: req2, res: res2 } = createMockReqRes("/web/home");
      await (app as unknown as InternalApp).handleRequest(req2, res2);
      expect(logs).toEqual(["web-home-handler"]);

      // Request to /apicheck (should NOT match /api prefix)
      logs.length = 0;
      app.get("/apicheck", (_req, res) => {
        logs.push("apicheck-handler");
        res.json({ ok: true });
      });
      const { req: req3, res: res3 } = createMockReqRes("/apicheck");
      await (app as unknown as InternalApp).handleRequest(req3, res3);
      expect(logs).toEqual(["apicheck-handler"]);
    });

    it("should support multiple middleware functions in app.use()", async () => {
      const app = createApp();
      const logs: string[] = [];

      const mw1 = async (_req: Request, _res: Response, next: () => Promise<void>) => {
        logs.push("mw1");
        await next();
      };
      const mw2 = async (_req: Request, _res: Response, next: () => Promise<void>) => {
        logs.push("mw2");
        await next();
      };

      app.use(mw1, mw2);

      app.get("/test", (_req, res) => {
        logs.push("handler");
        res.json({ ok: true });
      });

      const { req, res } = createMockReqRes("/test");
      await (app as unknown as InternalApp).handleRequest(req, res);

      expect(logs).toEqual(["mw1", "mw2", "handler"]);
    });

    it("should support multiple path-specific middleware functions in app.use('/prefix', mw1, mw2)", async () => {
      const app = createApp();
      const logs: string[] = [];

      const mw1 = async (_req: Request, _res: Response, next: () => Promise<void>) => {
        logs.push("mw1");
        await next();
      };
      const mw2 = async (_req: Request, _res: Response, next: () => Promise<void>) => {
        logs.push("mw2");
        await next();
      };

      app.use("/v1", mw1, mw2);

      app.get("/v1/items", (_req, res) => {
        logs.push("handler");
        res.json({ ok: true });
      });

      const { req, res } = createMockReqRes("/v1/items");
      await (app as unknown as InternalApp).handleRequest(req, res);

      expect(logs).toEqual(["mw1", "mw2", "handler"]);
    });

    it("should support route-specific middleware in app.get and app.post", async () => {
      const app = createApp();
      const logs: string[] = [];

      const authMw = async (_req: Request, _res: Response, next: () => Promise<void>) => {
        logs.push("auth");
        await next();
      };

      const validateMw = async (_req: Request, _res: Response, next: () => Promise<void>) => {
        logs.push("validate");
        await next();
      };

      app.get("/users", authMw, (_req, res) => {
        logs.push("get-handler");
        res.json({ ok: true });
      });

      app.post("/users", authMw, validateMw, (_req, res) => {
        logs.push("post-handler");
        res.json({ ok: true });
      });

      // GET /users
      const { req: getReq, res: getRes } = createMockReqRes("/users", "GET");
      await (app as unknown as InternalApp).handleRequest(getReq, getRes);
      expect(logs).toEqual(["auth", "get-handler"]);

      // POST /users
      logs.length = 0;
      const { req: postReq, res: postRes } = createMockReqRes("/users", "POST");
      await (app as unknown as InternalApp).handleRequest(postReq, postRes);
      expect(logs).toEqual(["auth", "validate", "post-handler"]);
    });

    it("should execute global -> path-specific -> route-specific -> handler in exact order", async () => {
      const app = createApp();
      const logs: string[] = [];

      app.use(async (_req, _res, next) => {
        logs.push("global-mw");
        await next();
      });

      app.use("/api", async (_req, _res, next) => {
        logs.push("path-mw");
        await next();
      });

      const routeMw = async (_req: Request, _res: Response, next: () => Promise<void>) => {
        logs.push("route-mw");
        await next();
      };

      app.get("/api/users", routeMw, (_req, res) => {
        logs.push("handler");
        res.json({ ok: true });
      });

      const { req, res } = createMockReqRes("/api/users");
      await (app as unknown as InternalApp).handleRequest(req, res);

      expect(logs).toEqual(["global-mw", "path-mw", "route-mw", "handler"]);
    });

    it("should allow route-specific middleware to access req.params", async () => {
      const app = createApp();
      let capturedId = "";

      const paramMw = async (req: Request, _res: Response, next: () => Promise<void>) => {
        capturedId = req.params.id;
        await next();
      };

      app.get("/users/:id", paramMw, (_req, res) => {
        res.json({ ok: true });
      });

      const { req, res } = createMockReqRes("/users/123");
      await (app as unknown as InternalApp).handleRequest(req, res);

      expect(capturedId).toBe("123");
    });
  });
});

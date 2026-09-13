import { describe, expect, it, vi } from "vitest";
import { createApp, type ErrorMiddleware, type Middleware } from "../../packages/core/src/index.js";
import { Request } from "../../packages/core/src/request.js";
import { Response } from "../../packages/core/src/response.js";

type InternalApp = { handleRequest: (req: Request, res: Response) => Promise<void> };

describe("Error Middleware", () => {
  it("should catch synchronous handler errors in error middleware", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.get("/sync-error", () => {
      throw new Error("Sync handler error");
    });

    const errorMw: ErrorMiddleware = (err, _req, res, _next) => {
      void _next;
      logs.push(`caught: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    };
    app.use(errorMw);

    const req = new Request({ method: "GET", url: "/sync-error" } as never);
    let endData = "";
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn((data) => {
        endData = data;
      }),
    };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(logs).toEqual(["caught: Sync handler error"]);
    expect(resMock.statusCode).toBe(500);
    expect(JSON.parse(endData)).toEqual({ error: "Sync handler error" });
  });

  it("should catch async handler errors in error middleware", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.get("/async-error", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error("Async handler error");
    });

    const errorMw: ErrorMiddleware = (err, _req, res, _next) => {
      void _next;
      logs.push(`caught: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    };
    app.use(errorMw);

    const req = new Request({ method: "GET", url: "/async-error" } as never);
    let endData = "";
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn((data) => {
        endData = data;
      }),
    };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(logs).toEqual(["caught: Async handler error"]);
    expect(resMock.statusCode).toBe(500);
    expect(JSON.parse(endData)).toEqual({ error: "Async handler error" });
  });

  it("should catch normal middleware errors in error middleware", async () => {
    const app = createApp();
    const logs: string[] = [];

    const badMw: Middleware = () => {
      throw new Error("Middleware error");
    };
    app.use(badMw);

    app.get("/test", (_req, res) => {
      logs.push("handler-should-not-run");
      res.json({ ok: true });
    });

    const errorMw: ErrorMiddleware = (err, _req, res, _next) => {
      void _next;
      logs.push(`caught: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    };
    app.use(errorMw);

    const req = new Request({ method: "GET", url: "/test" } as never);
    let endData = "";
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn((data) => {
        endData = data;
      }),
    };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(logs).toEqual(["caught: Middleware error"]);
    expect(resMock.statusCode).toBe(500);
    expect(JSON.parse(endData)).toEqual({ error: "Middleware error" });
  });

  it("should execute error middlewares in registration order and skip normal middleware when error occurs", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.get("/error", () => {
      throw new Error("Initial error");
    });

    const normalMw: Middleware = (_req, _res, next) => {
      logs.push("normal-mw-should-be-skipped");
      return next();
    };
    app.use(normalMw);

    const errMw1: ErrorMiddleware = async (err, _req, _res, next) => {
      logs.push(`errMw1: ${(err as Error).message}`);
      await next();
    };

    const errMw2: ErrorMiddleware = (err, _req, res, _next) => {
      void _next;
      logs.push(`errMw2: ${(err as Error).message}`);
      res.status(500).json({ handledBy: "errMw2" });
    };

    app.use(errMw1);
    app.use(errMw2);

    const req = new Request({ method: "GET", url: "/error" } as never);
    let endData = "";
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn((data) => {
        endData = data;
      }),
    };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(logs).toEqual(["errMw1: Initial error", "errMw2: Initial error"]);
    expect(resMock.statusCode).toBe(500);
    expect(JSON.parse(endData)).toEqual({ handledBy: "errMw2" });
  });

  it("should catch errors thrown inside error middleware and pass to next error middleware", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.get("/error", () => {
      throw new Error("First error");
    });

    const errMw1: ErrorMiddleware = (err, req, res, next) => {
      void err;
      void req;
      void res;
      void next;
      logs.push("errMw1 throwing second error");
      throw new Error("Second error");
    };

    const errMw2: ErrorMiddleware = (err, _req, res, _next) => {
      void _next;
      logs.push(`errMw2 caught: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    };

    app.use(errMw1);
    app.use(errMw2);

    const req = new Request({ method: "GET", url: "/error" } as never);
    let endData = "";
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn((data) => {
        endData = data;
      }),
    };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(logs).toEqual(["errMw1 throwing second error", "errMw2 caught: Second error"]);
    expect(JSON.parse(endData)).toEqual({ error: "Second error" });
  });

  it("should fallback to default 500 error handler when no error middleware handles it", async () => {
    const app = createApp();

    app.get("/error", () => {
      throw new Error("Unhandled error");
    });

    const req = new Request({ method: "GET", url: "/error" } as never);
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn(),
    };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(resMock.statusCode).toBe(500);
    expect(resMock.end).toHaveBeenCalled();
  });
});

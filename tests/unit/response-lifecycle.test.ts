import { describe, expect, it, vi } from "vitest";
import { createApp, type ErrorMiddleware } from "../../packages/core/src/index.js";
import { Request } from "../../packages/core/src/request.js";
import { Response } from "../../packages/core/src/response.js";

type InternalApp = { handleRequest: (req: Request, res: Response) => Promise<void> };

describe("Response Lifecycle & Middleware Short-Circuiting", () => {
  it("1. Middleware sends a response and does not call next() -> handler must not execute", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.use((_req, res) => {
      logs.push("mw-short-circuit");
      res.status(200).json({ early: true });
    });

    app.get("/test", (_req, res) => {
      logs.push("handler-should-not-run");
      res.json({ ok: true });
    });

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

    expect(logs).toEqual(["mw-short-circuit"]);
    expect(resMock.statusCode).toBe(200);
    expect(JSON.parse(endData)).toEqual({ early: true });
  });

  it("2. Middleware calls next() after sending a response -> downstream middleware/handler must not cause a second response", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.use(async (_req, res, next) => {
      logs.push("mw-send-first");
      res.status(200).json({ first: true });
      await next();
    });

    app.get("/test", (_req, res) => {
      logs.push("downstream-handler");
      try {
        res.json({ second: true });
      } catch (err) {
        logs.push(`caught-downstream-err: ${(err as Error).message}`);
      }
    });

    const req = new Request({ method: "GET", url: "/test" } as never);
    let endCallCount = 0;
    let endData = "";
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn((data) => {
        endCallCount++;
        endData = data;
        resMock.headersSent = true;
      }),
    };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(logs).toContain("mw-send-first");
    expect(logs).toContain("downstream-handler");
    expect(endCallCount).toBe(1);
    expect(JSON.parse(endData)).toEqual({ first: true });
  });

  it("3. Handler sends a response -> subsequent middleware after await next() can safely observe response status", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.use(async (_req, res, next) => {
      logs.push("mw-before");
      await next();
      logs.push(`mw-after-status-${res.raw.statusCode}`);
    });

    app.get("/test", (_req, res) => {
      logs.push("handler");
      res.status(201).json({ created: true });
    });

    const req = new Request({ method: "GET", url: "/test" } as never);
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn(),
    };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(logs).toEqual(["mw-before", "handler", "mw-after-status-201"]);
  });

  it("4. Middleware calls next() twice -> downstream chain must execute only once", async () => {
    const app = createApp();
    let handlerExecutions = 0;

    app.use(async (_req, _res, next) => {
      await next();
      await next();
    });

    app.get("/test", (_req, res) => {
      handlerExecutions++;
      res.json({ count: handlerExecutions });
    });

    const req = new Request({ method: "GET", url: "/test" } as never);
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn(),
    };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(handlerExecutions).toBe(1);
  });

  it("5. next() rejects -> error middleware receives the error", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.use(async (_req, _res, next) => {
      logs.push("mw-before");
      await next();
    });

    app.get("/test", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error("Async rejection in handler");
    });

    const errMw: ErrorMiddleware = (err, _req, res, _next) => {
      void _next;
      logs.push(`errMw-caught: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    };
    app.use(errMw);

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

    expect(logs).toEqual(["mw-before", "errMw-caught: Async rejection in handler"]);
    expect(JSON.parse(endData)).toEqual({ error: "Async rejection in handler" });
  });

  it("6. Error middleware sends a response -> no default 500 response afterward", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.get("/test", () => {
      throw new Error("Custom error");
    });

    const errMw: ErrorMiddleware = (err, _req, res, _next) => {
      void _next;
      logs.push("custom-error-mw");
      res.status(400).json({ custom: (err as Error).message });
    };
    app.use(errMw);

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

    expect(logs).toEqual(["custom-error-mw"]);
    expect(resMock.statusCode).toBe(400);
    expect(JSON.parse(endData)).toEqual({ custom: "Custom error" });
  });

  it("7. Error middleware calls next() -> next error middleware receives the same error", async () => {
    const app = createApp();
    const logs: string[] = [];

    app.get("/test", () => {
      throw new Error("Passed error");
    });

    const errMw1: ErrorMiddleware = async (err, _req, _res, next) => {
      logs.push(`errMw1: ${(err as Error).message}`);
      await next();
    };

    const errMw2: ErrorMiddleware = (err, _req, res, _next) => {
      void _next;
      logs.push(`errMw2: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    };

    app.use(errMw1);
    app.use(errMw2);

    const req = new Request({ method: "GET", url: "/test" } as never);
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn(),
    };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(logs).toEqual(["errMw1: Passed error", "errMw2: Passed error"]);
  });

  it("8. No middleware/handler responds -> existing 404 behavior remains correct", async () => {
    const app = createApp();

    const req = new Request({ method: "GET", url: "/nonexistent" } as never);
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn(),
    };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(resMock.statusCode).toBe(404);
    expect(resMock.end).toHaveBeenCalled();
  });

  it("9. Response headers/status are not written twice after headers are sent or response ended", async () => {
    const app = createApp();

    app.get("/test", (_req, res) => {
      res.status(200).json({ first: true });
      // Attempting to modify status or headers after sending response should not mutate statusCode/headers
      res.status(500);
      res.setHeader("X-Test", "ShouldNotBeSet");
    });

    const req = new Request({ method: "GET", url: "/test" } as never);
    const setHeaderFn = vi.fn();
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: setHeaderFn,
      getHeader: vi.fn(),
      end: vi.fn(() => {
        resMock.headersSent = true;
      }),
    };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(resMock.statusCode).toBe(200);
    expect(setHeaderFn).not.toHaveBeenCalledWith("X-Test", "ShouldNotBeSet");
  });

  it("10. Typed response handler sends exact expected JSON body and status code at runtime", async () => {
    type UserResponse = { id: string; name: string };
    const app = createApp();

    app.get<UserResponse>("/users/:id", (req, res) => {
      res.status(201).json({ id: req.params.id, name: "Samad" });
    });

    const req = new Request({ method: "GET", url: "/users/42" } as never);
    let endData = "";
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn((data) => {
        endData = data;
        resMock.headersSent = true;
      }),
    };
    const res = new Response<UserResponse>(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(resMock.statusCode).toBe(201);
    expect(JSON.parse(endData)).toEqual({ id: "42", name: "Samad" });
  });
});

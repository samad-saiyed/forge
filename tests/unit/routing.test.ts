import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../packages/core/src/index.js";
import { Request } from "../../packages/core/src/request.js";
import { Response } from "../../packages/core/src/response.js";

type InternalApp = { handleRequest: (req: Request, res: Response) => Promise<void> };

describe("HTTP Method Routing", () => {
  it("should support registering HTTP method handlers and method chaining", () => {
    const app = createApp();
    const handler = vi.fn();

    expect(app.get("/", handler)).toBe(app);
    expect(app.post("/users", handler)).toBe(app);
    expect(app.put("/users/1", handler)).toBe(app);
    expect(app.patch("/users/1", handler)).toBe(app);
    expect(app.delete("/users/1", handler)).toBe(app);
    expect(app.options("/", handler)).toBe(app);
    expect(app.head("/", handler)).toBe(app);
  });

  it("should execute matching route handler for HTTP methods", async () => {
    const app = createApp();
    const getHandler = vi.fn();
    const postHandler = vi.fn();

    app.get("/test", getHandler);
    app.post("/test", postHandler);

    // Call internal dispatcher via mock request/response
    const getReq = new Request({ method: "GET", url: "/test" } as never);
    const getRes = new Response({ statusCode: 200, end: vi.fn() } as never);
    await (app as unknown as InternalApp).handleRequest(getReq, getRes);

    expect(getHandler).toHaveBeenCalledTimes(1);
    expect(postHandler).not.toHaveBeenCalled();

    const postReq = new Request({ method: "POST", url: "/test" } as never);
    const postRes = new Response({ statusCode: 200, end: vi.fn() } as never);
    await (app as unknown as InternalApp).handleRequest(postReq, postRes);

    expect(postHandler).toHaveBeenCalledTimes(1);
  });

  it("should return 404 if no matching route or method exists", async () => {
    const app = createApp();
    app.get("/test", vi.fn());

    const req = new Request({ method: "POST", url: "/test" } as never);
    const resMock = { statusCode: 200, end: vi.fn() };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(resMock.statusCode).toBe(404);
    expect(resMock.end).toHaveBeenCalledTimes(1);
  });

  it("should handle thrown errors gracefully with 500 status", async () => {
    const app = createApp();
    app.get("/error", () => {
      throw new Error("Boom");
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

import { describe, expect, it, vi } from "vitest";
import { createApp, Router, type RouteMatch } from "../../packages/core/src/index.js";
import { Request } from "../../packages/core/src/request.js";
import { Response } from "../../packages/core/src/response.js";

type InternalApp = { handleRequest: (req: Request, res: Response) => Promise<void> };

describe("Type-safe Route Handlers & Parameter Inference", () => {
  it("should extract single path parameter in req.params (/users/:id)", async () => {
    const app = createApp();
    let capturedId: string | undefined;

    app.get("/users/:id", (req) => {
      capturedId = req.params.id;
    });

    const req = new Request({ method: "GET", url: "/users/42" } as never);
    const resMock = { statusCode: 200, end: vi.fn() };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(capturedId).toBe("42");
  });

  it("should extract multiple path parameters in req.params (/users/:userId/posts/:postId)", async () => {
    const app = createApp();
    let capturedUserId: string | undefined;
    let capturedPostId: string | undefined;

    app.get("/users/:userId/posts/:postId", (req) => {
      capturedUserId = req.params.userId;
      capturedPostId = req.params.postId;
    });

    const req = new Request({ method: "GET", url: "/users/user-100/posts/post-200" } as never);
    const resMock = { statusCode: 200, end: vi.fn() };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(capturedUserId).toBe("user-100");
    expect(capturedPostId).toBe("post-200");
  });

  it("should extract wildcard filepath parameter (/files/*filepath)", async () => {
    const app = createApp();
    let capturedFilepath: string | undefined;

    app.get("/files/*filepath", (req) => {
      capturedFilepath = req.params.filepath;
    });

    const req = new Request({ method: "GET", url: "/files/docs/2026/report.pdf" } as never);
    const resMock = { statusCode: 200, end: vi.fn() };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(capturedFilepath).toBe("docs/2026/report.pdf");
  });

  it("should decode URI encoded parameters (/users/hello%20world)", async () => {
    const app = createApp();
    let capturedName: string | undefined;

    app.get("/users/:name", (req) => {
      capturedName = req.params.name;
    });

    const req = new Request({ method: "GET", url: "/users/hello%20world" } as never);
    const resMock = { statusCode: 200, end: vi.fn() };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(capturedName).toBe("hello world");
  });

  it("should provide empty params for static routes", async () => {
    const app = createApp();
    let capturedParams: Record<string, string> | undefined;

    app.get("/users/all", (req) => {
      capturedParams = req.params;
    });

    const req = new Request({ method: "GET", url: "/users/all" } as never);
    const resMock = { statusCode: 200, end: vi.fn() };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(capturedParams).toEqual({});
  });

  it("should extract path parameters in path-scoped middleware", async () => {
    const app = createApp();
    let middlewareCapturedId: string | undefined;

    app.use("/users/:id", (req, _res, next) => {
      middlewareCapturedId = req.params.id;
      void next();
    });

    app.get("/users/:id", (_req, res) => {
      res.end();
    });

    const req = new Request({ method: "GET", url: "/users/99" } as never);
    const resMock = { statusCode: 200, end: vi.fn() };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(middlewareCapturedId).toBe("99");
  });

  it("should return typed RouteMatch from generic Router.find()", () => {
    const router = new Router();
    const handler = vi.fn();

    router.add("GET", "/users/:id", handler);

    type UserParams = { id: string };
    const match: RouteMatch<UserParams> | null = router.find<UserParams>("GET", "/users/123");

    expect(match).not.toBeNull();
    expect(match?.params.id).toBe("123");
  });
});

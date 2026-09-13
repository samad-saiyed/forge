import { describe, it, expect, vi } from "vitest";
import { Router } from "../../packages/core/src/router.js";
import { registerLoadedRoutes } from "../../packages/core/src";
import type { LoadedRouteModule } from "../../packages/core/src/route-loader.js";
import type { FileRouteHandler, RouteContext } from "../../packages/core/src/context.js";
import type { Application, RouteHandler } from "../../packages/core/src/application.js";
import type { Request } from "../../packages/core/src/request.js";
import type { Response } from "../../packages/core/src/response.js";

describe("Route Registrar (registerLoadedRoutes)", () => {
  it("registers a single loaded route into the router", () => {
    const router = new Router();
    const mockHandler: RouteHandler = vi.fn();

    const loadedRoute: LoadedRouteModule = {
      filePath: "/src/app/users/route.ts",
      routePath: "/users",
      handlers: new Map([["GET", mockHandler]]),
    };

    registerLoadedRoutes(router, [loadedRoute]);

    const match = router.find("GET", "/users");
    expect(match).not.toBeNull();
    expect(match?.handler).toBeDefined();
  });

  it("registers multiple HTTP methods for a route module independently", () => {
    const router = new Router();
    const getHandler: RouteHandler = vi.fn();
    const postHandler: RouteHandler = vi.fn();
    const deleteHandler: RouteHandler = vi.fn();

    const loadedRoute: LoadedRouteModule = {
      filePath: "/src/app/users/route.ts",
      routePath: "/users",
      handlers: new Map([
        ["GET", getHandler],
        ["POST", postHandler],
        ["DELETE", deleteHandler],
      ]),
    };

    registerLoadedRoutes(router, [loadedRoute]);

    expect(router.find("GET", "/users")).not.toBeNull();
    expect(router.find("POST", "/users")).not.toBeNull();
    expect(router.find("DELETE", "/users")).not.toBeNull();
    expect(router.find("PUT", "/users")).toBeNull();
  });

  it("registers dynamic parameter routes and verifies parameter matching", () => {
    const router = new Router();
    const getHandler: RouteHandler = vi.fn();

    const loadedRoute: LoadedRouteModule = {
      filePath: "/src/app/users/[id]/route.ts",
      routePath: "/users/:id",
      handlers: new Map([["GET", getHandler]]),
    };

    registerLoadedRoutes(router, [loadedRoute]);

    const match = router.find("GET", "/users/123");
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ id: "123" });
  });

  it("registers wildcard routes and matches wildcard paths", () => {
    const router = new Router();
    const getHandler: RouteHandler = vi.fn();

    const loadedRoute: LoadedRouteModule = {
      filePath: "/src/app/files/[...path]/route.ts",
      routePath: "/files/*path",
      handlers: new Map([["GET", getHandler]]),
    };

    registerLoadedRoutes(router, [loadedRoute]);

    const match = router.find("GET", "/files/docs/readme.txt");
    expect(match).not.toBeNull();
    expect(match?.params).toEqual({ path: "docs/readme.txt" });
  });

  it("preserves static > dynamic parameter route precedence", () => {
    const router = new Router();
    const meHandler: RouteHandler = vi.fn();
    const idHandler: RouteHandler = vi.fn();

    const staticRoute: LoadedRouteModule = {
      filePath: "/src/app/users/me/route.ts",
      routePath: "/users/me",
      handlers: new Map([["GET", meHandler]]),
    };

    const dynamicRoute: LoadedRouteModule = {
      filePath: "/src/app/users/[id]/route.ts",
      routePath: "/users/:id",
      handlers: new Map([["GET", idHandler]]),
    };

    registerLoadedRoutes(router, [dynamicRoute, staticRoute]);

    const matchMe = router.find("GET", "/users/me");
    expect(matchMe?.handler).toBeDefined();

    const matchOther = router.find("GET", "/users/456");
    expect(matchOther?.params).toEqual({ id: "456" });
  });

  it("allows filesystem routes and programmatic routes to coexist on the same router", () => {
    const router = new Router();
    const programHandler: RouteHandler = vi.fn();
    const fsHandler: RouteHandler = vi.fn();

    // Programmatic route registration
    router.add("GET", "/health", programHandler, undefined, undefined, "programmatic");

    // Filesystem route registration
    const fsRoute: LoadedRouteModule = {
      filePath: "/src/app/users/route.ts",
      routePath: "/users",
      handlers: new Map([["GET", fsHandler]]),
    };

    registerLoadedRoutes(router, [fsRoute]);

    expect(router.find("GET", "/health")).not.toBeNull();
    expect(router.find("GET", "/users")).not.toBeNull();
  });

  it("throws duplicate route error for filesystem + filesystem duplicates", () => {
    const router = new Router();
    const handler1: RouteHandler = vi.fn();
    const handler2: RouteHandler = vi.fn();

    const route1: LoadedRouteModule = {
      filePath: "/src/app/users/route.ts",
      routePath: "/users",
      handlers: new Map([["GET", handler1]]),
    };

    const route2: LoadedRouteModule = {
      filePath: "/src/app/users/index.ts", // duplicate path
      routePath: "/users",
      handlers: new Map([["GET", handler2]]),
    };

    expect(() => registerLoadedRoutes(router, [route1, route2])).toThrow(
      /Ambiguous filesystem route collision: GET \/users/,
    );
  });

  it("allows programmatic route to take precedence over filesystem route (programmatic + filesystem)", () => {
    const router = new Router();
    const programHandler: RouteHandler = vi.fn();
    const fsHandler: RouteHandler = vi.fn();

    router.add("GET", "/users", programHandler, undefined, undefined, "programmatic");

    const fsRoute: LoadedRouteModule = {
      filePath: "/src/app/users/route.ts",
      routePath: "/users",
      handlers: new Map([["GET", fsHandler]]),
    };

    // Registration should succeed without throwing; programmatic route takes precedence
    expect(() => registerLoadedRoutes(router, [fsRoute])).not.toThrow();

    const match = router.find("GET", "/users");
    expect(match?.handler).toBe(programHandler);
  });

  it("allows programmatic route to take precedence over filesystem route (filesystem + programmatic)", () => {
    const router = new Router();
    const programHandler: RouteHandler = vi.fn();
    const fsHandler: RouteHandler = vi.fn();

    const fsRoute: LoadedRouteModule = {
      filePath: "/src/app/users/route.ts",
      routePath: "/users",
      handlers: new Map([["GET", fsHandler]]),
    };

    registerLoadedRoutes(router, [fsRoute]);

    // Programmatic registration overrides existing filesystem route
    expect(() =>
      router.add("GET", "/users", programHandler, undefined, undefined, "programmatic"),
    ).not.toThrow();

    const match = router.find("GET", "/users");
    expect(match?.handler).toBe(programHandler);
  });

  it("supports FileRouteHandler signature receiving RouteContext", async () => {
    const router = new Router();
    let capturedCtx: RouteContext | undefined;

    const fileHandler: FileRouteHandler = (ctx) => {
      capturedCtx = ctx;
    };

    const loadedRoute: LoadedRouteModule = {
      filePath: "/src/app/test/route.ts",
      routePath: "/test",
      handlers: new Map([["GET", fileHandler]]),
    };

    const mockApp = {} as unknown as Application;
    registerLoadedRoutes(router, [loadedRoute], mockApp);

    const match = router.find("GET", "/test");
    expect(match).not.toBeNull();

    const mockReq = {} as unknown as Request;
    const mockRes = {} as unknown as Response;
    const mockNext = vi.fn();

    await match?.handler(mockReq, mockRes, mockNext);

    expect(capturedCtx).toBeDefined();
    expect(capturedCtx?.app).toBe(mockApp);
    expect(capturedCtx?.request).toBe(mockReq);
    expect(capturedCtx?.response).toBe(mockRes);
  });
});

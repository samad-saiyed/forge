import { describe, expect, it, vi } from "vitest";
import { Router } from "../../packages/core/src/router.js";

describe("Router", () => {
  it("should match static routes including root path", () => {
    const router = new Router();
    const handler = vi.fn();
    const rootHandler = vi.fn();
    router.add("GET", "/", rootHandler);
    router.add("GET", "/users", handler);

    const rootMatch = router.find("GET", "/");
    expect(rootMatch).not.toBeNull();
    expect(rootMatch?.handler).toBe(rootHandler);

    const match = router.find("GET", "/users");
    expect(match).not.toBeNull();
    expect(match?.handler).toBe(handler);
    expect(match?.params).toEqual({});
  });

  it("should extract dynamic route parameters", () => {
    const router = new Router();
    const handler = vi.fn();
    router.add("GET", "/users/:id/posts/:postId", handler);

    const match = router.find("GET", "/users/123/posts/456");
    expect(match).not.toBeNull();
    expect(match?.handler).toBe(handler);
    expect(match?.params).toEqual({ id: "123", postId: "456" });
  });

  it("should decode parameter values", () => {
    const router = new Router();
    const handler = vi.fn();
    router.add("GET", "/files/:filename", handler);

    const match = router.find("GET", "/files/hello%20world.txt");
    expect(match?.params).toEqual({ filename: "hello world.txt" });
  });

  it("should match wildcards", () => {
    const router = new Router();
    const handler = vi.fn();
    router.add("GET", "/assets/*", handler);

    const match = router.find("GET", "/assets/images/logo.png");
    expect(match).not.toBeNull();
    expect(match?.handler).toBe(handler);
    expect(match?.params).toEqual({ "*": "images/logo.png" });
  });

  it("should respect route precedence (static > dynamic > wildcard)", () => {
    const router = new Router();
    const staticHandler = vi.fn();
    const dynamicHandler = vi.fn();
    const wildcardHandler = vi.fn();

    router.add("GET", "/users/me", staticHandler);
    router.add("GET", "/users/:id", dynamicHandler);
    router.add("GET", "/users/*", wildcardHandler);

    expect(router.find("GET", "/users/me")?.handler).toBe(staticHandler);
    expect(router.find("GET", "/users/123")?.handler).toBe(dynamicHandler);
    expect(router.find("GET", "/users/123/profile")?.handler).toBe(wildcardHandler);
  });

  it("should handle trailing slashes consistently", () => {
    const router = new Router();
    const handler = vi.fn();
    router.add("GET", "/users", handler);

    expect(router.find("GET", "/users/")?.handler).toBe(handler);
  });

  it("should return null when no route matches method or path", () => {
    const router = new Router();
    router.add("GET", "/users", vi.fn());

    expect(router.find("POST", "/users")).toBeNull();
    expect(router.find("GET", "/nonexistent")).toBeNull();
  });

  it("is case-insensitive for HTTP methods", () => {
    const router = new Router();
    const handler = () => {};

    router.add("get", "/users", handler);

    expect(router.find("GET", "/users")?.handler).toBe(handler);
  });

  it("returns null for an unmatched route", () => {
    const router = new Router();
    router.add("GET", "/users", () => {});

    expect(router.find("GET", "/missing")).toBeNull();
  });

  it("matches a route parameter", () => {
    const router = new Router();
    const handler = () => {};

    router.add("GET", "/users/:id", handler);

    const match = router.find("GET", "/users/123");

    expect(match?.handler).toBe(handler);
    expect(match?.params).toEqual({
      id: "123",
    });
  });

  it("matches multiple route parameters", () => {
    const router = new Router();
    const handler = () => {};

    router.add("GET", "/users/:userId/posts/:postId", handler);

    const match = router.find("GET", "/users/42/posts/99");

    expect(match?.params).toEqual({
      userId: "42",
      postId: "99",
    });
  });

  it("decodes route parameters", () => {
    const router = new Router();
    const handler = () => {};

    router.add("GET", "/users/:name", handler);

    const match = router.find("GET", "/users/John%20Doe");

    expect(match?.params).toEqual({
      name: "John Doe",
    });
  });

  it("does not match a parameter route when the segment is missing", () => {
    const router = new Router();

    router.add("GET", "/users/:id", () => {});

    expect(router.find("GET", "/users")).toBeNull();
  });

  it("matches a wildcard route", () => {
    const router = new Router();
    const handler = () => {};

    router.add("GET", "/files/*", handler);

    const match = router.find("GET", "/files/a/b/c.txt");

    expect(match?.handler).toBe(handler);
    expect(match?.params["*"]).toBe("a/b/c.txt");
  });

  it("matches a named wildcard route", () => {
    const router = new Router();
    const handler = () => {};

    router.add("GET", "/files/*path", handler);

    const match = router.find("GET", "/files/a/b/c.txt");

    expect(match?.params).toEqual({
      path: "a/b/c.txt",
    });
  });

  it("allows a wildcard to match an empty remainder", () => {
    const router = new Router();
    const handler = () => {};

    router.add("GET", "/files/*", handler);

    expect(router.find("GET", "/files")?.handler).toBe(handler);
  });

  it("decodes wildcard values", () => {
    const router = new Router();
    const handler = () => {};

    router.add("GET", "/files/*path", handler);

    const match = router.find("GET", "/files/hello%20world/test.txt");

    expect(match?.params).toEqual({
      path: "hello world/test.txt",
    });
  });

  it("prefers static routes over parameter routes", () => {
    const router = new Router();
    const staticHandler = () => {};
    const paramHandler = () => {};

    router.add("GET", "/users/:id", paramHandler);
    router.add("GET", "/users/me", staticHandler);

    const match = router.find("GET", "/users/me");

    expect(match?.handler).toBe(staticHandler);
  });

  it("prefers parameter routes over wildcard routes", () => {
    const router = new Router();
    const paramHandler = () => {};
    const wildcardHandler = () => {};

    router.add("GET", "/files/*path", wildcardHandler);
    router.add("GET", "/files/:name", paramHandler);

    const match = router.find("GET", "/files/test.txt");

    expect(match?.handler).toBe(paramHandler);
  });

  it("does not allow a wildcard route to swallow a more specific static route", () => {
    const router = new Router();
    const wildcardHandler = () => {};
    const staticHandler = () => {};

    router.add("GET", "/files/*path", wildcardHandler);
    router.add("GET", "/files/download", staticHandler);

    expect(router.find("GET", "/files/download")?.handler).toBe(staticHandler);
  });

  it("uses the GET handler for HEAD requests", () => {
    const router = new Router();
    const handler = () => {};

    router.add("GET", "/users", handler);

    expect(router.find("HEAD", "/users")?.handler).toBe(handler);
  });

  it("prefers an explicit HEAD route when registered", () => {
    const router = new Router();
    const getHandler = () => {};
    const headHandler = () => {};

    router.add("GET", "/users", getHandler);
    router.add("HEAD", "/users", headHandler);

    expect(router.find("HEAD", "/users")?.handler).toBe(headHandler);
  });

  it("rejects an empty route method", () => {
    const router = new Router();

    expect(() => router.add("", "/users", () => {})).toThrow("Route method cannot be empty");
  });

  it("rejects an empty route path", () => {
    const router = new Router();

    expect(() => router.add("GET", "", () => {})).toThrow("Route path cannot be empty");
  });

  it("rejects a non-function handler", () => {
    const router = new Router();

    expect(() => router.add("GET", "/users", undefined as never)).toThrow(
      "Route handler must be a function",
    );
  });

  it("rejects duplicate route registration with a clear error", () => {
    const router = new Router();
    const firstHandler = () => {};
    const secondHandler = () => {};

    router.add("GET", "/users", firstHandler);

    expect(() => router.add("GET", "/users", secondHandler)).toThrow(
      "Duplicate route registration: GET /users",
    );
  });

  it("does not match when a parameter route has extra segments", () => {
    const router = new Router();

    router.add("GET", "/users/:id", () => {});

    expect(router.find("GET", "/users/123/profile")).toBeNull();
  });

  it("preserves an encoded slash inside a parameter", () => {
    const router = new Router();
    const handler = () => {};

    router.add("GET", "/files/:path", handler);

    const match = router.find("GET", "/files/a%2Fb");

    expect(match?.params).toEqual({
      path: "a/b",
    });
  });

  it("does not treat query strings as part of the route path", () => {
    const router = new Router();
    const handler = () => {};

    router.add("GET", "/users", handler);

    expect(router.find("GET", "/users?active=true")?.handler).toBe(handler);
  });

  it("matches nested static and dynamic paths", () => {
    const router = new Router();
    const handler = () => {};

    router.add("GET", "/users/:id/posts", handler);

    const match = router.find("GET", "/users/42/posts");

    expect(match?.handler).toBe(handler);
    expect(match?.params).toEqual({
      id: "42",
    });
  });

  it("matches deeply nested routes with multiple parameters", () => {
    const router = new Router();
    const handler = () => {};

    router.add("GET", "/products/:productId/reviews/:reviewId", handler);

    const match = router.find("GET", "/products/123/reviews/456");

    expect(match?.handler).toBe(handler);
    expect(match?.params).toEqual({
      productId: "123",
      reviewId: "456",
    });
  });

  it("allows static and parameter routes with the same shape", () => {
    const router = new Router();
    const staticHandler = () => {};
    const paramHandler = () => {};

    router.add("GET", "/users/me", staticHandler);
    router.add("GET", "/users/:id", paramHandler);

    expect(router.find("GET", "/users/me")?.handler).toBe(staticHandler);
    expect(router.find("GET", "/users/42")?.handler).toBe(paramHandler);
  });

  it("uses the correct parameter names for each route", () => {
    const router = new Router();
    const firstHandler = () => {};
    const secondHandler = () => {};

    router.add("GET", "/users/:id", firstHandler);
    router.add("GET", "/accounts/:accountId", secondHandler);

    expect(router.find("GET", "/users/10")?.params).toEqual({
      id: "10",
    });

    expect(router.find("GET", "/accounts/20")?.params).toEqual({
      accountId: "20",
    });
  });

  it("enforces full precedence hierarchy across static, param, and wildcard routes", () => {
    const router = new Router();
    const staticHandler = () => {};
    const paramHandler = () => {};
    const wildcardHandler = () => {};

    router.add("GET", "/users/me", staticHandler);
    router.add("GET", "/users/:id", paramHandler);
    router.add("GET", "/users/*rest", wildcardHandler);

    expect(router.find("GET", "/users/me")?.handler).toBe(staticHandler);

    const paramMatch = router.find("GET", "/users/123");
    expect(paramMatch?.handler).toBe(paramHandler);
    expect(paramMatch?.params).toEqual({ id: "123" });

    const wildcardMatch = router.find("GET", "/users/123/x");
    expect(wildcardMatch?.handler).toBe(wildcardHandler);
    expect(wildcardMatch?.params).toEqual({ rest: "123/x" });
  });

  it("overwrites handlers and param names when registered at the same structural position", () => {
    const router = new Router();
    const firstHandler = () => {};
    const secondHandler = () => {};

    router.add("GET", "/users/:id", firstHandler);
    router.add("GET", "/users/:userId", secondHandler);

    const match = router.find("GET", "/users/123");
    expect(match?.handler).toBe(secondHandler);
    expect(match?.params).toEqual({ userId: "123" });
  });

  it("prefers explicit HEAD route over GET route for dynamic routes", () => {
    const router = new Router();
    const getHandler = () => {};
    const headHandler = () => {};

    router.add("GET", "/users/:id", getHandler);
    router.add("HEAD", "/users/:id", headHandler);

    const match = router.find("HEAD", "/users/123");
    expect(match?.handler).toBe(headHandler);
    expect(match?.params).toEqual({ id: "123" });
  });
});

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
});

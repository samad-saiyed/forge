import { describe, test, expect } from "vitest";
import { isRouteFile, resolveRoutePath } from "../../packages/core/src/index.js";

describe("Filesystem Route Path Resolver", () => {
  describe("isRouteFile", () => {
    test("returns true for route.ts files", () => {
      expect(isRouteFile("app/route.ts")).toBe(true);
      expect(isRouteFile("app/users/route.ts")).toBe(true);
      expect(isRouteFile("C:/project/src/app/users/[id]/route.ts")).toBe(true);
    });

    test("returns false for non-route files", () => {
      expect(isRouteFile("app/route.ts.bak")).toBe(false);
      expect(isRouteFile("app/route.test.ts")).toBe(false);
      expect(isRouteFile("app/route.test.js")).toBe(false);
      expect(isRouteFile("app/users/page.ts")).toBe(false);
      expect(isRouteFile("app/users/schema.ts")).toBe(false);
      expect(isRouteFile("app/users/README.md")).toBe(false);
      expect(isRouteFile("app/users/helper.js")).toBe(false);
    });
  });

  describe("resolveRoutePath", () => {
    test("resolves root route.ts to /", () => {
      expect(resolveRoutePath("app/route.ts")).toBe("/");
      expect(resolveRoutePath("route.ts")).toBe("/");
    });

    test("resolves static directory segments", () => {
      expect(resolveRoutePath("app/users/route.ts")).toBe("/users");
      expect(resolveRoutePath("app/users/profile/route.ts")).toBe("/users/profile");
      expect(resolveRoutePath("app/health/route.ts")).toBe("/health");
    });

    test("resolves dynamic parameter segments [paramName]", () => {
      expect(resolveRoutePath("app/users/[id]/route.ts")).toBe("/users/:id");
      expect(resolveRoutePath("app/users/[userId]/posts/[postId]/route.ts")).toBe(
        "/users/:userId/posts/:postId",
      );
    });

    test("resolves wildcard segments [...paramName]", () => {
      expect(resolveRoutePath("app/files/[...path]/route.ts")).toBe("/files/*path");
      expect(resolveRoutePath("app/[...slug]/route.ts")).toBe("/*slug");
    });

    test("returns null for non-route files", () => {
      expect(resolveRoutePath("app/users/page.ts")).toBeNull();
      expect(resolveRoutePath("app/users/helper.js")).toBeNull();
      expect(resolveRoutePath("app/users/route.ts.bak")).toBeNull();
    });

    test("handles root directory options correctly", () => {
      const appRoot = "/my-app/src/app";
      expect(resolveRoutePath("/my-app/src/app/users/[id]/route.ts", appRoot)).toBe("/users/:id");
      expect(resolveRoutePath("/my-app/src/app/route.ts", appRoot)).toBe("/");
    });

    test("normalizes slashes and preserves exact parameter names", () => {
      expect(resolveRoutePath("app/users/[user_id]/route.ts")).toBe("/users/:user_id");
      expect(resolveRoutePath("app/users/[userId]/route.ts")).toBe("/users/:userId");
    });

    test("throws an error for malformed dynamic segments", () => {
      const invalidPaths = [
        "app/users/[id/route.ts",
        "app/users/[id]]/route.ts",
        "app/users/[]/route.ts",
        "app/files/[...]/route.ts",
        "app/files/[...path/route.ts",
      ];

      for (const invalidPath of invalidPaths) {
        expect(() => resolveRoutePath(invalidPath)).toThrow(/Invalid dynamic route segment/);
      }
    });
  });
});

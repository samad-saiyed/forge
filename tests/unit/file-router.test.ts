import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { discoverRoutes } from "../../packages/core/src";

describe("discoverRoutes", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kyuu-file-router-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("discovers root route.ts", async () => {
    const routePath = path.join(tmpDir, "route.ts");
    await fs.writeFile(routePath, `export const GET = async () => {};`, "utf-8");

    const routes = await discoverRoutes({ root: tmpDir });
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      method: "GET",
      path: "/",
      filePath: routePath,
    });
    expect(typeof routes[0].handler).toBe("function");
  });

  test("discovers nested static route", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    const routePath = path.join(usersDir, "route.ts");
    await fs.writeFile(routePath, `export const GET = async () => {};`, "utf-8");

    const routes = await discoverRoutes({ root: tmpDir });
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      method: "GET",
      path: "/users",
      filePath: routePath,
    });
  });

  test("converts [id] dynamic parameter to :id", async () => {
    const userDir = path.join(tmpDir, "users", "[id]");
    await fs.mkdir(userDir, { recursive: true });
    const routePath = path.join(userDir, "route.ts");
    await fs.writeFile(routePath, `export const GET = async () => {};`, "utf-8");

    const routes = await discoverRoutes({ root: tmpDir });
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      method: "GET",
      path: "/users/:id",
      filePath: routePath,
    });
  });

  test("converts multiple dynamic parameters in path", async () => {
    const postDir = path.join(tmpDir, "users", "[id]", "posts", "[postId]");
    await fs.mkdir(postDir, { recursive: true });
    const routePath = path.join(postDir, "route.ts");
    await fs.writeFile(routePath, `export const GET = async () => {};`, "utf-8");

    const routes = await discoverRoutes({ root: tmpDir });
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      method: "GET",
      path: "/users/:id/posts/:postId",
      filePath: routePath,
    });
  });

  test("converts [...path] wildcard to *path", async () => {
    const filesDir = path.join(tmpDir, "files", "[...path]");
    await fs.mkdir(filesDir, { recursive: true });
    const routePath = path.join(filesDir, "route.ts");
    await fs.writeFile(routePath, `export const GET = async () => {};`, "utf-8");

    const routes = await discoverRoutes({ root: tmpDir });
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      method: "GET",
      path: "/files/*path",
      filePath: routePath,
    });
  });

  test("discovers multiple HTTP methods from one route file", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    const routePath = path.join(usersDir, "route.ts");
    await fs.writeFile(
      routePath,
      `
        export const GET = async () => {};
        export const POST = async () => {};
        export const DELETE = async () => {};
      `,
      "utf-8",
    );

    const routes = await discoverRoutes({ root: tmpDir });
    expect(routes).toHaveLength(3);
    const methods = routes.map((r) => r.method).sort();
    expect(methods).toEqual(["DELETE", "GET", "POST"]);
    expect(routes.every((r) => r.path === "/users")).toBe(true);
    expect(routes.every((r) => r.filePath === routePath)).toBe(true);
  });

  test("ignores non-route.ts files and _ prefixed directories", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    await fs.writeFile(
      path.join(usersDir, "route.ts"),
      `export const GET = async () => {};`,
      "utf-8",
    );
    await fs.writeFile(path.join(usersDir, "service.ts"), `export const service = {};`, "utf-8");
    await fs.writeFile(path.join(usersDir, "schema.ts"), `export const schema = {};`, "utf-8");
    await fs.writeFile(path.join(usersDir, "index.ts"), `export const index = {};`, "utf-8");

    const hiddenDir = path.join(tmpDir, "_components");
    await fs.mkdir(hiddenDir, { recursive: true });
    await fs.writeFile(
      path.join(hiddenDir, "route.ts"),
      `export const GET = async () => {};`,
      "utf-8",
    );

    const routes = await discoverRoutes({ root: tmpDir });
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/users");
  });

  test("rejects malformed dynamic segments", async () => {
    const invalidDirs = ["[id", "[id]]", "[]", "[...]", "[...id"];

    for (const invalidDir of invalidDirs) {
      const dirPath = path.join(tmpDir, "invalid", invalidDir);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(
        path.join(dirPath, "route.ts"),
        `export const GET = async () => {};`,
        "utf-8",
      );

      await expect(discoverRoutes({ root: tmpDir })).rejects.toThrow();
      await fs.rm(path.join(tmpDir, "invalid"), { recursive: true, force: true });
    }
  });

  test("rejects invalid HTTP method exports (non-function)", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    const routePath = path.join(usersDir, "route.ts");
    await fs.writeFile(routePath, `export const GET = "not a function";`, "utf-8");

    await expect(discoverRoutes({ root: tmpDir })).rejects.toThrow(/GET/);
  });

  test("preserves filePath on discovered routes", async () => {
    const routePath = path.join(tmpDir, "route.ts");
    await fs.writeFile(routePath, `export const GET = async () => {};`, "utf-8");

    const routes = await discoverRoutes({ root: tmpDir });
    expect(routes[0].filePath).toBe(routePath);
  });

  test("returns empty array for empty or missing app directory", async () => {
    const nonExistentDir = path.join(tmpDir, "does-not-exist");
    const routes1 = await discoverRoutes({ root: nonExistentDir });
    expect(routes1).toEqual([]);

    const emptyDir = path.join(tmpDir, "empty");
    await fs.mkdir(emptyDir, { recursive: true });
    const routes2 = await discoverRoutes({ root: emptyDir });
    expect(routes2).toEqual([]);
  });
});

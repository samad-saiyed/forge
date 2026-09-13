import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { scanRouteFiles, type DiscoveredRouteFile } from "../../packages/core/src";

describe("Route Scanner (scanRouteFiles)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-scanner-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("discovers valid route.ts files recursively and resolves route paths", () => {
    // Structure:
    // tempDir/
    // ├── route.ts
    // ├── users/
    // │   ├── route.ts
    // │   └── [id]/
    // │       └── route.ts
    // └── files/
    //     └── [...path]/
    //         └── route.ts

    const rootRoute = path.join(tempDir, "route.ts");
    const usersRoute = path.join(tempDir, "users", "route.ts");
    const userIdRoute = path.join(tempDir, "users", "[id]", "route.ts");
    const filesPathRoute = path.join(tempDir, "files", "[...path]", "route.ts");

    fs.mkdirSync(path.dirname(usersRoute), { recursive: true });
    fs.mkdirSync(path.dirname(userIdRoute), { recursive: true });
    fs.mkdirSync(path.dirname(filesPathRoute), { recursive: true });

    fs.writeFileSync(rootRoute, "export const GET = () => {};");
    fs.writeFileSync(usersRoute, "export const GET = () => {};");
    fs.writeFileSync(userIdRoute, "export const GET = () => {};");
    fs.writeFileSync(filesPathRoute, "export const GET = () => {};");

    const routes: DiscoveredRouteFile[] = scanRouteFiles({ appDir: tempDir });

    expect(routes).toHaveLength(4);

    const routeMap = new Map(routes.map((r) => [r.routePath, r.filePath]));
    expect(routeMap.get("/")).toBe(rootRoute);
    expect(routeMap.get("/users")).toBe(usersRoute);
    expect(routeMap.get("/users/:id")).toBe(userIdRoute);
    expect(routeMap.get("/files/*path")).toBe(filesPathRoute);
  });

  it("ignores non-route files and underscore-prefixed directories", () => {
    // Structure:
    // tempDir/
    // ├── route.ts
    // ├── helper.ts
    // ├── schema.ts
    // ├── route.js
    // ├── route.test.ts
    // ├── _components/
    // │   └── route.ts
    // └── _utils/
    //     └── helper.ts

    const rootRoute = path.join(tempDir, "route.ts");
    const helperFile = path.join(tempDir, "helper.ts");
    const schemaFile = path.join(tempDir, "schema.ts");
    const jsRoute = path.join(tempDir, "route.js");
    const testRoute = path.join(tempDir, "route.test.ts");
    const privateCompRoute = path.join(tempDir, "_components", "route.ts");
    const privateUtilsFile = path.join(tempDir, "_utils", "helper.ts");

    fs.mkdirSync(path.dirname(privateCompRoute), { recursive: true });
    fs.mkdirSync(path.dirname(privateUtilsFile), { recursive: true });

    fs.writeFileSync(rootRoute, "export const GET = () => {};");
    fs.writeFileSync(helperFile, "export const helper = () => {};");
    fs.writeFileSync(schemaFile, "export const schema = {};");
    fs.writeFileSync(jsRoute, "export const GET = () => {};");
    fs.writeFileSync(testRoute, "test()");
    fs.writeFileSync(privateCompRoute, "export const GET = () => {};");
    fs.writeFileSync(privateUtilsFile, "export const util = () => {};");

    const routes = scanRouteFiles({ appDir: tempDir });

    expect(routes).toHaveLength(1);
    expect(routes[0]).toEqual({
      filePath: rootRoute,
      routePath: "/",
    });
  });

  it("returns an empty array if appDir is empty", () => {
    const routes = scanRouteFiles({ appDir: tempDir });
    expect(routes).toEqual([]);
  });

  it("throws an error if appDir does not exist", () => {
    const nonExistentDir = path.join(tempDir, "does-not-exist");

    expect(() => scanRouteFiles({ appDir: nonExistentDir })).toThrow(
      `App directory "${nonExistentDir}" does not exist.`,
    );
  });

  it("throws an error if appDir is a file instead of a directory", () => {
    const filePath = path.join(tempDir, "file.txt");
    fs.writeFileSync(filePath, "hello");

    expect(() => scanRouteFiles({ appDir: filePath })).toThrow(
      `App directory "${filePath}" is not a directory.`,
    );
  });

  it("returns deterministically sorted results", () => {
    // Structure with multiple routes in non-alphabetical creation order
    const routesToCreate = [
      { subDir: "z-end", routePath: "/z-end" },
      { subDir: "users/[id]", routePath: "/users/:id" },
      { subDir: "users", routePath: "/users" },
      { subDir: "about", routePath: "/about" },
    ];

    fs.writeFileSync(path.join(tempDir, "route.ts"), "export const GET = () => {};");

    for (const item of routesToCreate) {
      const dir = path.join(tempDir, item.subDir);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "route.ts"), "export const GET = () => {};");
    }

    const routes = scanRouteFiles({ appDir: tempDir });

    const routePaths = routes.map((r) => r.routePath);
    const sortedRoutePaths = [...routePaths].sort((a, b) => a.localeCompare(b));

    expect(routePaths).toEqual(sortedRoutePaths);
  });
});

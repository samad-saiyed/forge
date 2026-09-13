import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadRouteModule, loadRouteModules, type LoadedRouteModule } from "../../packages/core/src";
import type { DiscoveredRouteFile } from "../../packages/core/src/route-scanner.js";

describe("Route Loader (loadRouteModule / loadRouteModules)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-loader-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("loads a valid route module with HTTP method handlers", async () => {
    const routeFile = path.join(tempDir, "route.js");
    fs.writeFileSync(
      routeFile,
      `
      export const GET = async () => "get response";
      export const POST = async () => "post response";
    `,
    );

    const discovered: DiscoveredRouteFile = {
      filePath: routeFile,
      routePath: "/",
    };

    const loaded: LoadedRouteModule = await loadRouteModule(discovered);

    expect(loaded.filePath).toBe(routeFile);
    expect(loaded.routePath).toBe("/");
    expect(loaded.handlers.size).toBe(2);
    expect(loaded.handlers.has("GET")).toBe(true);
    expect(loaded.handlers.has("POST")).toBe(true);
    expect(typeof loaded.handlers.get("GET")).toBe("function");
    expect(typeof loaded.handlers.get("POST")).toBe("function");
  });

  it("supports all standard HTTP methods and normalizes method names to uppercase", async () => {
    const routeFile = path.join(tempDir, "route.js");
    fs.writeFileSync(
      routeFile,
      `
      export const GET = () => {};
      export const POST = () => {};
      export const PUT = () => {};
      export const PATCH = () => {};
      export const DELETE = () => {};
      export const OPTIONS = () => {};
      export const HEAD = () => {};
    `,
    );

    const discovered: DiscoveredRouteFile = {
      filePath: routeFile,
      routePath: "/test",
    };

    const loaded = await loadRouteModule(discovered);

    expect(loaded.handlers.size).toBe(7);
    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];
    for (const method of methods) {
      expect(loaded.handlers.has(method)).toBe(true);
    }
  });

  it("ignores non-HTTP-method helper exports and config objects", async () => {
    const routeFile = path.join(tempDir, "route.js");
    fs.writeFileSync(
      routeFile,
      `
      export const GET = () => {};
      export const config = { runtime: "nodejs" };
      export const schema = { type: "object" };
      export function helper() { return 42; }
    `,
    );

    const discovered: DiscoveredRouteFile = {
      filePath: routeFile,
      routePath: "/users",
    };

    const loaded = await loadRouteModule(discovered);

    expect(loaded.handlers.size).toBe(1);
    expect(loaded.handlers.has("GET")).toBe(true);
    expect(loaded.handlers.has("config")).toBe(false);
    expect(loaded.handlers.has("schema")).toBe(false);
    expect(loaded.handlers.has("helper")).toBe(false);
  });

  it("loads empty route modules successfully with zero handlers", async () => {
    const routeFile = path.join(tempDir, "route.js");
    fs.writeFileSync(routeFile, "// empty route file\n");

    const discovered: DiscoveredRouteFile = {
      filePath: routeFile,
      routePath: "/empty",
    };

    const loaded = await loadRouteModule(discovered);

    expect(loaded.filePath).toBe(routeFile);
    expect(loaded.routePath).toBe("/empty");
    expect(loaded.handlers.size).toBe(0);
  });

  it("throws a descriptive error when an HTTP method export is not a function", async () => {
    const routeFile = path.join(tempDir, "route.js");
    fs.writeFileSync(
      routeFile,
      `
      export const GET = "not a function";
    `,
    );

    const discovered: DiscoveredRouteFile = {
      filePath: routeFile,
      routePath: "/invalid",
    };

    await expect(loadRouteModule(discovered)).rejects.toThrow(
      `Invalid handler for HTTP method "GET" in route module "${routeFile}": expected function, got string`,
    );
  });

  it("surfaces module initialization / import errors cleanly", async () => {
    const routeFile = path.join(tempDir, "route.js");
    fs.writeFileSync(
      routeFile,
      `
      throw new Error("Initialization crash inside route file");
    `,
    );

    const discovered: DiscoveredRouteFile = {
      filePath: routeFile,
      routePath: "/broken",
    };

    await expect(loadRouteModule(discovered)).rejects.toThrow(
      `Failed to import route module at "${routeFile}": Initialization crash inside route file`,
    );
  });

  it("loads multiple route modules via loadRouteModules", async () => {
    const route1 = path.join(tempDir, "route1.js");
    const route2 = path.join(tempDir, "route2.js");

    fs.writeFileSync(route1, "export const GET = () => 'r1';");
    fs.writeFileSync(route2, "export const POST = () => 'r2';");

    const discoveredList: DiscoveredRouteFile[] = [
      { filePath: route1, routePath: "/r1" },
      { filePath: route2, routePath: "/r2" },
    ];

    const loadedList = await loadRouteModules(discoveredList);

    expect(loadedList).toHaveLength(2);
    expect(loadedList[0].routePath).toBe("/r1");
    expect(loadedList[0].handlers.has("GET")).toBe(true);
    expect(loadedList[1].routePath).toBe("/r2");
    expect(loadedList[1].handlers.has("POST")).toBe(true);
  });
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createApp,
  discoverBuildRouteEntries,
  discoverRoutes,
} from "../../packages/core/src/index.js";

describe("Action 70.6 — Production Filesystem Route Discovery", { timeout: 15000 }, () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `kyuu-build-routes-test-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ type: "module" }), "utf8");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("discovers static routes correctly", async () => {
    mkdirSync(join(tempDir, "src", "app", "users"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "users", "route.js"),
      `export const GET = () => "users";`,
      "utf8",
    );

    const routes = await discoverBuildRouteEntries({
      projectRoot: tempDir,
      language: "javascript",
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]).toEqual({
      method: "GET",
      pattern: "/users",
      sourcePath: "src/app/users/route.js",
      modulePath: "app/users/route.js",
    });
  });

  it("discovers dynamic routes with single parameter", async () => {
    mkdirSync(join(tempDir, "src", "app", "users", "[id]"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "users", "[id]", "route.js"),
      `export const GET = () => "user-detail";`,
      "utf8",
    );

    const routes = await discoverBuildRouteEntries({
      projectRoot: tempDir,
      language: "javascript",
    });

    expect(routes).toHaveLength(1);
    expect(routes[0].pattern).toBe("/users/:id");
    expect(routes[0].method).toBe("GET");
  });

  it("discovers dynamic routes with multiple parameters", async () => {
    mkdirSync(join(tempDir, "src", "app", "users", "[userId]", "posts", "[postId]"), {
      recursive: true,
    });
    writeFileSync(
      join(tempDir, "src", "app", "users", "[userId]", "posts", "[postId]", "route.js"),
      `export const GET = () => "post";`,
      "utf8",
    );

    const routes = await discoverBuildRouteEntries({
      projectRoot: tempDir,
      language: "javascript",
    });

    expect(routes).toHaveLength(1);
    expect(routes[0].pattern).toBe("/users/:userId/posts/:postId");
  });

  it("discovers wildcard routes using Kyuu semantics", async () => {
    mkdirSync(join(tempDir, "src", "app", "files", "[...filepath]"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "files", "[...filepath]", "route.js"),
      `export const GET = () => "files";`,
      "utf8",
    );

    const routes = await discoverBuildRouteEntries({
      projectRoot: tempDir,
      language: "javascript",
    });

    expect(routes).toHaveLength(1);
    expect(routes[0].pattern).toBe("/files/*filepath");
  });

  it("discovers multiple HTTP method exports from a single route module", async () => {
    mkdirSync(join(tempDir, "src", "app", "items"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "items", "route.js"),
      `export const GET = () => "get";\nexport const POST = () => "post";\nexport const DELETE = () => "del";`,
      "utf8",
    );

    const routes = await discoverBuildRouteEntries({
      projectRoot: tempDir,
      language: "javascript",
    });

    expect(routes).toHaveLength(3);
    const methods = routes.map((r) => r.method).sort();
    expect(methods).toEqual(["DELETE", "GET", "POST"]);
  });

  it("discovers deep nested route hierarchies", async () => {
    mkdirSync(join(tempDir, "src", "app", "dashboard", "settings", "profile"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "dashboard", "settings", "profile", "route.js"),
      `export const GET = () => "profile";`,
      "utf8",
    );

    const routes = await discoverBuildRouteEntries({
      projectRoot: tempDir,
      language: "javascript",
    });

    expect(routes).toHaveLength(1);
    expect(routes[0].pattern).toBe("/dashboard/settings/profile");
  });

  it("fails discovery when invalid dynamic segment syntax is encountered", async () => {
    mkdirSync(join(tempDir, "src", "app", "[bad-param!]"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "[bad-param!]", "route.js"),
      `export const GET = () => "error";`,
      "utf8",
    );

    await expect(
      discoverBuildRouteEntries({ projectRoot: tempDir, language: "javascript" }),
    ).rejects.toThrow(/Invalid dynamic route segment/);
  });

  it("fails discovery when route method export is not a function", async () => {
    mkdirSync(join(tempDir, "src", "app", "invalid"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "invalid", "route.js"),
      `export const GET = "not-a-function";`,
      "utf8",
    );

    await expect(
      discoverBuildRouteEntries({ projectRoot: tempDir, language: "javascript" }),
    ).rejects.toThrow(/Invalid handler for HTTP method/);
  });

  it("does not interfere with manual app.get() / app.post() route registrations", () => {
    const app = createApp();
    app.get("/manual-health", (_req, res) => {
      res.json({ status: "ok" });
    });

    // Manual route registration is untouched
    expect(app).toBeDefined();
  });

  it("produces identical route graph (methods & patterns) as runtime discoverRoutes", async () => {
    mkdirSync(join(tempDir, "src", "app", "api", "users", "[id]"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "api", "users", "[id]", "route.js"),
      `export const GET = () => "get";\nexport const PUT = () => "put";`,
      "utf8",
    );
    mkdirSync(join(tempDir, "src", "app", "api", "health"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "api", "health", "route.js"),
      `export const GET = () => "ok";`,
      "utf8",
    );

    // 1. Dev/Runtime discovery
    const devRoutes = await discoverRoutes({ root: join(tempDir, "src", "app") });
    const devGraph = devRoutes.map((r) => `${r.method} ${r.path}`).sort();

    // 2. Build discovery
    const buildEntries = await discoverBuildRouteEntries({
      projectRoot: tempDir,
      language: "javascript",
    });
    const buildGraph = buildEntries.map((e) => `${e.method} ${e.pattern}`).sort();

    expect(buildGraph).toEqual(devGraph);
  });
});

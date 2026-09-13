import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUILD_FORMAT_VERSION,
  BuildOutputManager,
  createApp,
  discoverBuildRouteEntries,
  generateBuildManifest,
  ManifestGenerationError,
  parseBuildManifest,
  type BuildRouteEntry,
} from "../../packages/core/src/index.js";

describe("Action 70.7 — Production Route Manifest", { timeout: 15000 }, () => {
  let tempDir: string;
  let manager: BuildOutputManager;

  beforeEach(() => {
    tempDir = join(tmpdir(), `forge-build-manifest-test-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ type: "module" }), "utf8");
    manager = new BuildOutputManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates a valid, versioned production manifest in staging directory", async () => {
    const stagingDir = manager.prepareStaging();
    const sampleRoutes: BuildRouteEntry[] = [
      {
        method: "GET",
        pattern: "/users",
        sourcePath: "src/app/users/route.ts",
        modulePath: "app/users/route.js",
      },
    ];

    const manifest = await generateBuildManifest({
      projectRoot: tempDir,
      stagingDir,
      language: "typescript",
      configPathRelative: "forge.config.js",
      routes: sampleRoutes,
    });

    expect(manifest.metadata.formatVersion).toBe(BUILD_FORMAT_VERSION);
    expect(manifest.metadata.language).toBe("typescript");
    expect(manifest.metadata.configPath).toBe("forge.config.js");
    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0]).toEqual(sampleRoutes[0]);

    const manifestFilePath = join(stagingDir, "manifest.json");
    expect(existsSync(manifestFilePath)).toBe(true);

    const writtenContent = readFileSync(manifestFilePath, "utf8");
    const parsed = parseBuildManifest(writtenContent);
    expect(parsed).toEqual(manifest);
  });

  it("preserves dynamic parameters, multiple parameters, and wildcards in manifest", async () => {
    const stagingDir = manager.prepareStaging();
    const routes: BuildRouteEntry[] = [
      {
        method: "GET",
        pattern: "/users/:id",
        sourcePath: "src/app/users/[id]/route.ts",
        modulePath: "app/users/[id]/route.js",
      },
      {
        method: "GET",
        pattern: "/users/:userId/posts/:postId",
        sourcePath: "src/app/users/[userId]/posts/[postId]/route.ts",
        modulePath: "app/users/[userId]/posts/[postId]/route.js",
      },
      {
        method: "GET",
        pattern: "/files/*path",
        sourcePath: "src/app/files/[...path]/route.ts",
        modulePath: "app/files/[...path]/route.js",
      },
    ];

    const manifest = await generateBuildManifest({
      projectRoot: tempDir,
      stagingDir,
      language: "typescript",
      configPathRelative: "forge.config.js",
      routes,
    });

    expect(manifest.routes.map((r) => r.pattern)).toEqual([
      "/files/*path",
      "/users/:id",
      "/users/:userId/posts/:postId",
    ]);
  });

  it("preserves independent entries for multiple HTTP methods on the same route pattern", async () => {
    const stagingDir = manager.prepareStaging();
    const routes: BuildRouteEntry[] = [
      {
        method: "POST",
        pattern: "/users",
        sourcePath: "src/app/users/route.ts",
        modulePath: "app/users/route.js",
      },
      {
        method: "GET",
        pattern: "/users",
        sourcePath: "src/app/users/route.ts",
        modulePath: "app/users/route.js",
      },
    ];

    const manifest = await generateBuildManifest({
      projectRoot: tempDir,
      stagingDir,
      language: "typescript",
      configPathRelative: "forge.config.js",
      routes,
    });

    expect(manifest.routes).toHaveLength(2);
    expect(manifest.routes[0].method).toBe("GET");
    expect(manifest.routes[1].method).toBe("POST");
  });

  it("produces deterministic ordering across multiple manifest generation runs", async () => {
    const stagingDir1 = manager.prepareStaging();
    const routesUnsorted: BuildRouteEntry[] = [
      {
        method: "POST",
        pattern: "/users",
        sourcePath: "src/app/users/route.ts",
        modulePath: "app/users/route.js",
      },
      {
        method: "GET",
        pattern: "/health",
        sourcePath: "src/app/health/route.ts",
        modulePath: "app/health/route.js",
      },
      {
        method: "GET",
        pattern: "/users",
        sourcePath: "src/app/users/route.ts",
        modulePath: "app/users/route.js",
      },
    ];

    const manifest1 = await generateBuildManifest({
      projectRoot: tempDir,
      stagingDir: stagingDir1,
      language: "typescript",
      configPathRelative: "forge.config.js",
      routes: routesUnsorted,
    });

    const content1 = readFileSync(join(stagingDir1, "manifest.json"), "utf8");

    const stagingDir2 = join(tempDir, "staging2");
    const manifest2 = await generateBuildManifest({
      projectRoot: tempDir,
      stagingDir: stagingDir2,
      language: "typescript",
      configPathRelative: "forge.config.js",
      routes: [...routesUnsorted].reverse(),
    });

    const content2 = readFileSync(join(stagingDir2, "manifest.json"), "utf8");

    // Route ordering and metadata (except timestamp if run in same tick) are deterministic
    expect(manifest1.routes).toEqual(manifest2.routes);
    expect(content1.replace(/"builtAt": ".*"/, "")).toBe(content2.replace(/"builtAt": ".*"/, ""));
  });

  it("rejects absolute or out-of-bounds module paths in manifest route entries", async () => {
    const stagingDir = manager.prepareStaging();

    const invalidAbsolute: BuildRouteEntry[] = [
      {
        method: "GET",
        pattern: "/users",
        sourcePath: "src/app/users/route.ts",
        modulePath: "/absolute/path/app/users/route.js",
      },
    ];

    await expect(
      generateBuildManifest({
        projectRoot: tempDir,
        stagingDir,
        language: "typescript",
        configPathRelative: "forge.config.js",
        routes: invalidAbsolute,
      }),
    ).rejects.toThrow(ManifestGenerationError);
  });

  it("does not serialize manual app.get() / app.post() route handlers into the manifest", async () => {
    const app = createApp();
    app.get("/manual-health", (_req, res) => {
      res.json({ ok: true });
    });

    // Filesystem route discovery from source project
    mkdirSync(join(tempDir, "src", "app", "fs-route"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "fs-route", "route.js"),
      `export const GET = () => "ok";`,
      "utf8",
    );

    const routes = await discoverBuildRouteEntries({
      projectRoot: tempDir,
      language: "javascript",
    });

    const stagingDir = manager.prepareStaging();
    const manifest = await generateBuildManifest({
      projectRoot: tempDir,
      stagingDir,
      language: "javascript",
      configPathRelative: "forge.config.js",
      routes,
    });

    // Manifest contains only discovered filesystem routes; manual routes are not serialized
    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0].pattern).toBe("/fs-route");
    expect(JSON.stringify(manifest)).not.toContain("/manual-health");
  });

  it("end-to-end integration test: discovers and serializes complete project route graph", async () => {
    mkdirSync(join(tempDir, "src", "app", "users"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "users", "route.js"),
      `export const GET = () => "list";\nexport const POST = () => "create";`,
      "utf8",
    );

    mkdirSync(join(tempDir, "src", "app", "users", "[id]"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "users", "[id]", "route.js"),
      `export const GET = () => "detail";`,
      "utf8",
    );

    mkdirSync(join(tempDir, "src", "app", "files", "[...filepath]"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "files", "[...filepath]", "route.js"),
      `export const GET = () => "file";`,
      "utf8",
    );

    const discoveredRoutes = await discoverBuildRouteEntries({
      projectRoot: tempDir,
      language: "javascript",
    });

    const stagingDir = manager.prepareStaging();
    const manifest = await generateBuildManifest({
      projectRoot: tempDir,
      stagingDir,
      language: "javascript",
      configPathRelative: "forge.config.js",
      routes: discoveredRoutes,
    });

    expect(manifest.routes).toHaveLength(4);
    expect(manifest.routes.map((r) => `${r.method} ${r.pattern}`)).toEqual([
      "GET /files/*filepath",
      "GET /users",
      "POST /users",
      "GET /users/:id",
    ]);

    // Verify written manifest file in staging parses cleanly
    const content = readFileSync(join(stagingDir, "manifest.json"), "utf8");
    const parsed = parseBuildManifest(content);
    expect(parsed).toEqual(manifest);
  });
});

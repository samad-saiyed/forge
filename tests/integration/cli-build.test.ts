import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILD_OUTPUT_DIR, parseBuildManifest } from "../../packages/core/src/index.js";
import { handleBuildCommand, runCli } from "../../packages/cli/src/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Action 70.8 — Build Pipeline Integration & 'forge build' CLI Tests", () => {
  let tempDir: string;
  let stdoutLogs: string[];
  let stderrLogs: string[];

  const customStdout = (msg: string) => stdoutLogs.push(msg);
  const customStderr = (msg: string) => stderrLogs.push(msg);

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `forge-cli-build-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir, { recursive: true });
    stdoutLogs = [];
    stderrLogs = [];
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("A. Basic TypeScript build through CLI 'forge build'", { timeout: 15000 }, async () => {
    writeFileSync(
      join(tempDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext" } }),
    );
    writeFileSync(join(tempDir, "forge.config.ts"), `export default {};`);
    mkdirSync(join(tempDir, "src", "app", "hello"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "hello", "route.ts"),
      `export const GET = () => "hello world";`,
    );

    const res = await runCli(["build"], {
      projectRoot: tempDir,
      stdout: customStdout,
      stderr: customStderr,
    });

    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Forge build complete.");
    expect(res.output).toContain("Language:     typescript");
    expect(res.output).toContain("Routes:       1");

    const manifestPath = join(tempDir, BUILD_OUTPUT_DIR, "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = parseBuildManifest(readFileSync(manifestPath, "utf8"));
    expect(manifest.metadata.language).toBe("typescript");
    expect(manifest.metadata.configPath).toBe("forge.config.js");
    expect(manifest.routes[0].pattern).toBe("/hello");
    expect(manifest.routes[0].modulePath).toBe("app/hello/route.js");
    expect(existsSync(join(tempDir, BUILD_OUTPUT_DIR, "src", manifest.routes[0].modulePath))).toBe(
      true,
    );
  });

  it("B. JavaScript build through CLI 'forge build'", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "js-app", type: "module" }),
    );
    writeFileSync(join(tempDir, "forge.config.js"), `export default {};`);
    mkdirSync(join(tempDir, "src", "app", "js-route"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "js-route", "route.js"),
      `export const GET = () => "ok js";`,
    );

    const res = await runCli(["build"], {
      projectRoot: tempDir,
      stdout: customStdout,
      stderr: customStderr,
    });

    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Forge build complete.");
    expect(res.output).toContain("Language:     javascript");

    const manifestPath = join(tempDir, BUILD_OUTPUT_DIR, "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = parseBuildManifest(readFileSync(manifestPath, "utf8"));
    expect(manifest.metadata.language).toBe("javascript");
    expect(manifest.metadata.configPath).toBe("forge.config.js");
    expect(manifest.routes[0].pattern).toBe("/js-route");
    expect(manifest.routes[0].modulePath).toBe("app/js-route/route.js");
  });

  it("C. Filesystem routes: params and wildcards", async () => {
    writeFileSync(join(tempDir, "forge.config.js"), `export default {};`);
    mkdirSync(join(tempDir, "src", "app", "users", "[id]"), { recursive: true });
    mkdirSync(join(tempDir, "src", "app", "files", "[...filepath]"), { recursive: true });

    writeFileSync(
      join(tempDir, "src", "app", "users", "route.js"),
      `export const GET = () => "all users";`,
    );
    writeFileSync(
      join(tempDir, "src", "app", "users", "[id]", "route.js"),
      `export const GET = () => "user by id";`,
    );
    writeFileSync(
      join(tempDir, "src", "app", "files", "[...filepath]", "route.js"),
      `export const GET = () => "file catchall";`,
    );

    const res = await handleBuildCommand([], {
      projectRoot: tempDir,
      stdout: customStdout,
      stderr: customStderr,
    });

    expect(res.exitCode).toBe(0);

    const manifestPath = join(tempDir, BUILD_OUTPUT_DIR, "manifest.json");
    const manifest = parseBuildManifest(readFileSync(manifestPath, "utf8"));

    expect(manifest.routes).toHaveLength(3);
    const patterns = manifest.routes.map((r) => r.pattern);
    expect(patterns).toContain("/users");
    expect(patterns).toContain("/users/:id");
    expect(patterns).toContain("/files/*filepath");
  });

  it("D. Multiple HTTP methods in a single route file", async () => {
    writeFileSync(join(tempDir, "forge.config.js"), `export default {};`);
    mkdirSync(join(tempDir, "src", "app", "api", "items"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "api", "items", "route.js"),
      `export const GET = () => "list"; export const POST = () => "create"; export const DELETE = () => "del";`,
    );

    const res = await handleBuildCommand([], {
      projectRoot: tempDir,
      stdout: customStdout,
      stderr: customStderr,
    });

    expect(res.exitCode).toBe(0);

    const manifestPath = join(tempDir, BUILD_OUTPUT_DIR, "manifest.json");
    const manifest = parseBuildManifest(readFileSync(manifestPath, "utf8"));

    const itemRoutes = manifest.routes.filter((r) => r.pattern === "/api/items");
    expect(itemRoutes).toHaveLength(3);
    const methods = itemRoutes.map((r) => r.method);
    expect(methods).toContain("DELETE");
    expect(methods).toContain("GET");
    expect(methods).toContain("POST");
  });

  it("E. Manual route regression: app.get() route registrations do not pollute manifest", async () => {
    writeFileSync(join(tempDir, "forge.config.js"), `export default {};`);
    mkdirSync(join(tempDir, "src", "app", "fs-route"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "fs-route", "route.js"),
      `export const GET = () => "fs route";`,
    );

    // Add custom index file with app.get() manual handler
    writeFileSync(
      join(tempDir, "src", "index.js"),
      `import { createApp } from "@forge/core"; const app = createApp(); app.get("/manual-health", (_req, res) => { res.json({ ok: true }); });`,
    );

    const res = await handleBuildCommand([], {
      projectRoot: tempDir,
      stdout: customStdout,
      stderr: customStderr,
    });

    expect(res.exitCode).toBe(0);

    const manifestPath = join(tempDir, BUILD_OUTPUT_DIR, "manifest.json");
    const manifest = parseBuildManifest(readFileSync(manifestPath, "utf8"));

    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0].pattern).toBe("/fs-route");
  });

  it("F. Invalid TypeScript fails build, returns non-zero exitCode, discards staging", async () => {
    writeFileSync(
      join(tempDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", strict: true } }),
    );
    writeFileSync(join(tempDir, "forge.config.ts"), `export default {};`);
    mkdirSync(join(tempDir, "src", "app"), { recursive: true });
    // Write invalid TS with type error
    writeFileSync(
      join(tempDir, "src", "app", "route.ts"),
      `const x: number = "not a number"; export const GET = () => x;`,
    );

    const res = await runCli(["build"], {
      projectRoot: tempDir,
      stdout: customStdout,
      stderr: customStderr,
    });

    expect(res.exitCode).not.toBe(0);
    expect(res.output).toContain("Forge build failed.");
    expect(res.output).toContain("TypeScript compilation failed");
    expect(existsSync(join(tempDir, BUILD_OUTPUT_DIR))).toBe(false);
    expect(existsSync(join(tempDir, ".forge", "build-staging"))).toBe(false);
  });

  it("G. Invalid configuration fails build cleanly", async () => {
    writeFileSync(join(tempDir, "forge.config.js"), `this is invalid syntax !!!`);

    const res = await runCli(["build"], {
      projectRoot: tempDir,
      stdout: customStdout,
      stderr: customStderr,
    });

    expect(res.exitCode).not.toBe(0);
    expect(res.output).toContain("Forge build failed.");
  });

  it("H. Invalid filesystem route file fails build cleanly", async () => {
    writeFileSync(join(tempDir, "forge.config.js"), `export default {};`);
    mkdirSync(join(tempDir, "src", "app", "broken"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "broken", "route.js"),
      `throw new Error("Route module parse failure");`,
    );

    const res = await runCli(["build"], {
      projectRoot: tempDir,
      stdout: customStdout,
      stderr: customStderr,
    });

    expect(res.exitCode).not.toBe(0);
    expect(res.output).toContain("Forge build failed.");
  });

  it("I. Repeated builds succeed without stale output files", async () => {
    writeFileSync(join(tempDir, "forge.config.js"), `export default {};`);
    mkdirSync(join(tempDir, "src", "app", "v1"), { recursive: true });
    writeFileSync(join(tempDir, "src", "app", "v1", "route.js"), `export const GET = () => "v1";`);

    // Build 1
    const res1 = await handleBuildCommand([], { projectRoot: tempDir });
    expect(res1.exitCode).toBe(0);

    const manifest1 = parseBuildManifest(
      readFileSync(join(tempDir, BUILD_OUTPUT_DIR, "manifest.json"), "utf8"),
    );
    expect(manifest1.routes).toHaveLength(1);
    expect(manifest1.routes[0].pattern).toBe("/v1");

    // Remove v1 route, add v2 route
    rmSync(join(tempDir, "src", "app", "v1"), { recursive: true, force: true });
    mkdirSync(join(tempDir, "src", "app", "v2"), { recursive: true });
    writeFileSync(join(tempDir, "src", "app", "v2", "route.js"), `export const GET = () => "v2";`);

    // Build 2
    const res2 = await handleBuildCommand([], { projectRoot: tempDir });
    expect(res2.exitCode).toBe(0);

    const manifest2 = parseBuildManifest(
      readFileSync(join(tempDir, BUILD_OUTPUT_DIR, "manifest.json"), "utf8"),
    );
    expect(manifest2.routes).toHaveLength(1);
    expect(manifest2.routes[0].pattern).toBe("/v2");
    expect(existsSync(join(tempDir, BUILD_OUTPUT_DIR, "app", "v1", "route.js"))).toBe(false);
  });

  it("J. Previous successful build is preserved when subsequent build fails", async () => {
    writeFileSync(
      join(tempDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext" } }),
    );
    writeFileSync(join(tempDir, "forge.config.ts"), `export default {};`);
    mkdirSync(join(tempDir, "src", "app", "valid"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "valid", "route.ts"),
      `export const GET = () => "valid";`,
    );

    // Build 1: Success
    const res1 = await handleBuildCommand([], { projectRoot: tempDir });
    expect(res1.exitCode).toBe(0);

    const manifestPath = join(tempDir, BUILD_OUTPUT_DIR, "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const initialManifest = readFileSync(manifestPath, "utf8");

    // Introduce a TypeScript error
    writeFileSync(
      join(tempDir, "src", "app", "valid", "route.ts"),
      `const err: number = "broken"; export const GET = () => err;`,
    );

    // Build 2: Failure
    const res2 = await handleBuildCommand([], {
      projectRoot: tempDir,
      stdout: customStdout,
      stderr: customStderr,
    });

    expect(res2.exitCode).toBe(1);
    expect(res2.output).toContain("Forge build failed.");

    // Previous build output remains intact!
    expect(existsSync(manifestPath)).toBe(true);
    const preservedManifest = readFileSync(manifestPath, "utf8");
    expect(preservedManifest).toBe(initialManifest);
  });

  it("K. CLI exit codes: 0 on success, 1 on failure", async () => {
    writeFileSync(join(tempDir, "forge.config.js"), `export default {};`);
    mkdirSync(join(tempDir, "src", "app"), { recursive: true });
    writeFileSync(join(tempDir, "src", "app", "route.js"), `export const GET = () => "ok";`);

    const okRes = await runCli(["build"], { projectRoot: tempDir });
    expect(okRes.exitCode).toBe(0);

    const failRes = await runCli(["build"], { projectRoot: join(tempDir, "nonexistent") });
    expect(failRes.exitCode).toBe(1);
  });
});

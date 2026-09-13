import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BUILD_OUTPUT_DIR } from "../../packages/core/src/index.js";
import { handleBuildCommand, handleStartCommand, runCli } from "../../packages/cli/src/index.js";

function makeHttpRequest(url: string, method = "GET"): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 500, body: data }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("Action 70.9 — Production Runtime & 'forge start' CLI Integration Tests", () => {
  let tempDir: string;
  let stdoutLogs: string[];
  let stderrLogs: string[];

  const customStdout = (msg: string) => stdoutLogs.push(msg);
  const customStderr = (msg: string) => stderrLogs.push(msg);

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `forge-cli-start-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

  it("1. Starts valid TypeScript production build and responds to HTTP requests", async () => {
    writeFileSync(
      join(tempDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext" } }),
    );
    writeFileSync(join(tempDir, "forge.config.ts"), `export default { server: { port: 5111 } };`);
    mkdirSync(join(tempDir, "src", "app", "hello"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "hello", "route.ts"),
      `export const GET = (_req: any, res: any) => { res.json({ message: "hello ts" }); };`,
    );

    // Build first
    const buildRes = await handleBuildCommand([], { projectRoot: tempDir });
    expect(buildRes.exitCode).toBe(0);

    // Start production server
    const startRes = await handleStartCommand([], {
      projectRoot: tempDir,
      attachSignalHandlers: false,
      stdout: customStdout,
      stderr: customStderr,
    });

    expect(startRes.exitCode).toBe(0);
    expect(startRes.output).toContain("Forge production server running at http://");
    expect(startRes.output).toContain("5111");

    try {
      const httpRes = await makeHttpRequest("http://localhost:5111/hello");
      expect(httpRes.status).toBe(200);
      expect(JSON.parse(httpRes.body)).toEqual({ message: "hello ts" });
    } finally {
      if (startRes.runnerResult?.app) {
        await startRes.runnerResult.app.close();
      }
    }
  });

  it("2. Starts valid JavaScript production build and responds to HTTP requests", async () => {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(tempDir, "forge.config.js"), `export default { server: { port: 5112 } };`);
    mkdirSync(join(tempDir, "src", "app", "js-route"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "js-route", "route.js"),
      `export const GET = (_req, res) => { res.json({ status: "ok js" }); };`,
    );

    const buildRes = await handleBuildCommand([], { projectRoot: tempDir });
    expect(buildRes.exitCode).toBe(0);

    const startRes = await handleStartCommand([], {
      projectRoot: tempDir,
      attachSignalHandlers: false,
    });

    expect(startRes.exitCode).toBe(0);

    try {
      const httpRes = await makeHttpRequest("http://localhost:5112/js-route");
      expect(httpRes.status).toBe(200);
      expect(JSON.parse(httpRes.body)).toEqual({ status: "ok js" });
    } finally {
      if (startRes.runnerResult?.app) {
        await startRes.runnerResult.app.close();
      }
    }
  });

  it("3. Serves static, dynamic, and wildcard filesystem routes in production", async () => {
    writeFileSync(join(tempDir, "forge.config.js"), `export default { server: { port: 5113 } };`);
    mkdirSync(join(tempDir, "src", "app", "users", "[id]"), { recursive: true });
    mkdirSync(join(tempDir, "src", "app", "files", "[...filepath]"), { recursive: true });

    writeFileSync(
      join(tempDir, "src", "app", "users", "route.js"),
      `export const GET = (_req, res) => { res.json({ route: "users" }); };`,
    );
    writeFileSync(
      join(tempDir, "src", "app", "users", "[id]", "route.js"),
      `export const GET = (req, res) => { res.json({ id: req.params.id }); };`,
    );
    writeFileSync(
      join(tempDir, "src", "app", "files", "[...filepath]", "route.js"),
      `export const GET = (req, res) => { res.json({ path: req.params.filepath }); };`,
    );

    await handleBuildCommand([], { projectRoot: tempDir });

    const startRes = await handleStartCommand([], {
      projectRoot: tempDir,
      attachSignalHandlers: false,
    });

    expect(startRes.exitCode).toBe(0);

    try {
      // 1. Static route
      const staticRes = await makeHttpRequest("http://localhost:5113/users");
      expect(JSON.parse(staticRes.body)).toEqual({ route: "users" });

      // 2. Dynamic parameter route
      const dynamicRes = await makeHttpRequest("http://localhost:5113/users/99");
      expect(JSON.parse(dynamicRes.body)).toEqual({ id: "99" });

      // 3. Wildcard route
      const wildcardRes = await makeHttpRequest("http://localhost:5113/files/docs/api/v1");
      expect(JSON.parse(wildcardRes.body)).toEqual({ path: "docs/api/v1" });
    } finally {
      if (startRes.runnerResult?.app) {
        await startRes.runnerResult.app.close();
      }
    }
  });

  it("4. Supports multiple HTTP methods exported by a single route module", async () => {
    writeFileSync(join(tempDir, "forge.config.js"), `export default { server: { port: 5114 } };`);
    mkdirSync(join(tempDir, "src", "app", "items"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "items", "route.js"),
      `
      export const GET = (_req, res) => { res.json({ action: "read" }); };
      export const POST = (_req, res) => { res.json({ action: "create" }); };
      export const DELETE = (_req, res) => { res.json({ action: "delete" }); };
      `,
    );

    await handleBuildCommand([], { projectRoot: tempDir });

    const startRes = await handleStartCommand([], {
      projectRoot: tempDir,
      attachSignalHandlers: false,
    });

    try {
      const getRes = await makeHttpRequest("http://localhost:5114/items", "GET");
      expect(JSON.parse(getRes.body)).toEqual({ action: "read" });

      const postRes = await makeHttpRequest("http://localhost:5114/items", "POST");
      expect(JSON.parse(postRes.body)).toEqual({ action: "create" });

      const delRes = await makeHttpRequest("http://localhost:5114/items", "DELETE");
      expect(JSON.parse(delRes.body)).toEqual({ action: "delete" });
    } finally {
      if (startRes.runnerResult?.app) {
        await startRes.runnerResult.app.close();
      }
    }
  });

  it("5. Respects runtime port override via options", async () => {
    writeFileSync(join(tempDir, "forge.config.js"), `export default { server: { port: 5115 } };`);
    mkdirSync(join(tempDir, "src", "app", "ping"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "ping", "route.js"),
      `export const GET = (_req, res) => { res.json({ pong: true }); };`,
    );

    await handleBuildCommand([], { projectRoot: tempDir });

    // Override port to 5999 at startup
    const startRes = await handleStartCommand([], {
      projectRoot: tempDir,
      port: 5999,
      attachSignalHandlers: false,
    });

    expect(startRes.exitCode).toBe(0);
    expect(startRes.output).toContain("5999");

    try {
      const httpRes = await makeHttpRequest("http://localhost:5999/ping");
      expect(httpRes.status).toBe(200);
      expect(JSON.parse(httpRes.body)).toEqual({ pong: true });
    } finally {
      if (startRes.runnerResult?.app) {
        await startRes.runnerResult.app.close();
      }
    }
  });

  it("6. Fails cleanly with exit code 1 when no build artifact exists", async () => {
    const res = await runCli(["start"], {
      projectRoot: tempDir,
      stdout: customStdout,
      stderr: customStderr,
    });

    expect(res.exitCode).toBe(1);
    expect(res.output).toContain("Forge production server failed to start.");
    expect(res.output).toContain("No production build found. Run `forge build` first.");
  });

  it("7. Fails cleanly when build manifest is corrupted", async () => {
    const buildDir = join(tempDir, BUILD_OUTPUT_DIR);
    mkdirSync(buildDir, { recursive: true });
    writeFileSync(join(buildDir, "manifest.json"), "invalid JSON content");

    const res = await runCli(["start"], {
      projectRoot: tempDir,
      stdout: customStdout,
      stderr: customStderr,
    });

    expect(res.exitCode).toBe(1);
    expect(res.output).toContain("Forge production server failed to start.");
    expect(res.output).toContain("manifest is invalid");
  });

  it("8. Fails cleanly when referenced route module file is missing", async () => {
    writeFileSync(join(tempDir, "forge.config.js"), `export default {};`);
    mkdirSync(join(tempDir, "src", "app", "ghost"), { recursive: true });
    writeFileSync(join(tempDir, "src", "app", "ghost", "route.js"), `export const GET = () => {};`);

    await handleBuildCommand([], { projectRoot: tempDir });

    // Remove the compiled module file from build artifact
    const buildDir = join(tempDir, BUILD_OUTPUT_DIR);
    const manifest = JSON.parse(readFileSync(join(buildDir, "manifest.json"), "utf8"));
    const moduleRel = manifest.routes[0].modulePath;
    const targetFile = existsSync(join(buildDir, moduleRel))
      ? join(buildDir, moduleRel)
      : join(buildDir, "src", moduleRel);

    if (existsSync(targetFile)) {
      rmSync(targetFile, { force: true });
    }

    const res = await handleStartCommand([], {
      projectRoot: tempDir,
      stdout: customStdout,
      stderr: customStderr,
    });

    expect(res.exitCode).toBe(1);
    expect(res.output).toContain("Forge production server failed to start.");
    expect(res.output).toContain("referenced in manifest.json does not exist");
  });
});

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleBuildCommand, handleStartCommand } from "../../packages/cli/src/index.js";

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

describe("Action 70.10 — Production Portability & Independence Integration Tests", () => {
  let tempDir: string;
  let stdoutLogs: string[];
  let stderrLogs: string[];

  const customStdout = (msg: string) => stdoutLogs.push(msg);
  const customStderr = (msg: string) => stderrLogs.push(msg);

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `forge-cli-portability-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

  it(
    "1. Starts server and responds to HTTP requests when src/ directory and source config are completely removed",
    { timeout: 15000 },
    async () => {
      // 1. Create project with TS source and forge.config.ts
      writeFileSync(
        join(tempDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext" } }),
      );
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "test-app", type: "module" }),
      );
      writeFileSync(join(tempDir, "forge.config.ts"), `export default { server: { port: 5201 } };`);
      mkdirSync(join(tempDir, "src", "app", "portable"), { recursive: true });
      writeFileSync(
        join(tempDir, "src", "app", "portable", "route.ts"),
        `export const GET = (_req: any, res: any) => { res.json({ status: "portable ok" }); };`,
      );

      // 2. Build production artifact
      const buildRes = await handleBuildCommand([], { projectRoot: tempDir });
      expect(buildRes.exitCode).toBe(0);

      // 3. Remove source directory (src/) and source config file (forge.config.ts)
      rmSync(join(tempDir, "src"), { recursive: true, force: true });
      rmSync(join(tempDir, "forge.config.ts"), { force: true });
      rmSync(join(tempDir, "tsconfig.json"), { force: true });

      expect(existsSync(join(tempDir, "src"))).toBe(false);
      expect(existsSync(join(tempDir, "forge.config.ts"))).toBe(false);

      // 4. Run `forge start` from production artifact alone
      const startRes = await handleStartCommand([], {
        projectRoot: tempDir,
        attachSignalHandlers: false,
        stdout: customStdout,
        stderr: customStderr,
      });

      expect(startRes.exitCode).toBe(0);
      expect(startRes.output).toContain("5201");

      try {
        const httpRes = await makeHttpRequest("http://localhost:5201/portable");
        expect(httpRes.status).toBe(200);
        expect(JSON.parse(httpRes.body)).toEqual({ status: "portable ok" });
      } finally {
        if (startRes.runnerResult?.app) {
          await startRes.runnerResult.app.close();
        }
      }
    },
  );

  it("2. Operates seamlessly under ESM package configuration", async () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "esm-app", type: "module" }),
    );
    writeFileSync(join(tempDir, "forge.config.js"), `export default { server: { port: 5202 } };`);
    mkdirSync(join(tempDir, "src", "app", "info"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "info", "route.js"),
      `export const GET = (_req, res) => { res.json({ esm: true }); };`,
    );

    const buildRes = await handleBuildCommand([], { projectRoot: tempDir });
    expect(buildRes.exitCode).toBe(0);

    const startRes = await handleStartCommand([], {
      projectRoot: tempDir,
      attachSignalHandlers: false,
    });

    expect(startRes.exitCode).toBe(0);

    try {
      const httpRes = await makeHttpRequest("http://localhost:5202/info");
      expect(httpRes.status).toBe(200);
      expect(JSON.parse(httpRes.body)).toEqual({ esm: true });
    } finally {
      if (startRes.runnerResult?.app) {
        await startRes.runnerResult.app.close();
      }
    }
  });
});

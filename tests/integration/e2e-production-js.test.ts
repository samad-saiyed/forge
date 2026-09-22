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

describe("Action 70.11 — End-to-End JavaScript Production Integration Suite", () => {
  let tempDir: string;
  let stdoutLogs: string[];
  let stderrLogs: string[];

  const customStdout = (msg: string) => stdoutLogs.push(msg);
  const customStderr = (msg: string) => stderrLogs.push(msg);

  beforeEach(() => {
    tempDir = join(tmpdir(), `kyuu-e2e-js-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
    "1. Comprehensive JavaScript Production E2E: kyuu build -> kyuu start -> HTTP requests",
    { timeout: 15000 },
    async () => {
      // 1. Setup pure JavaScript ESM project
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "e2e-js-app", type: "module" }),
      );
      writeFileSync(join(tempDir, "kyuu.config.js"), `export default { server: { port: 5350 } };`);

      // 2. Setup JS filesystem routes
      mkdirSync(join(tempDir, "src", "app", "api"), { recursive: true });
      writeFileSync(
        join(tempDir, "src", "app", "api", "route.js"),
        `export const GET = (_req, res) => { res.json({ js: true, env: "prod" }); };`,
      );

      mkdirSync(join(tempDir, "src", "app", "items", "[id]"), { recursive: true });
      writeFileSync(
        join(tempDir, "src", "app", "items", "[id]", "route.js"),
        `export const GET = (req, res) => { res.json({ item: req.params.id }); };`,
      );

      // 3. Build JS project
      const buildRes = await handleBuildCommand([], { projectRoot: tempDir });
      expect(buildRes.exitCode).toBe(0);

      // 4. Start production server
      const startRes = await handleStartCommand([], {
        projectRoot: tempDir,
        attachSignalHandlers: false,
        stdout: customStdout,
        stderr: customStderr,
      });

      expect(startRes.exitCode).toBe(0);
      expect(startRes.output).toContain("5350");

      try {
        // Test API endpoint
        const apiRes = await makeHttpRequest("http://localhost:5350/api");
        expect(apiRes.status).toBe(200);
        expect(JSON.parse(apiRes.body)).toEqual({ js: true, env: "prod" });

        // Test Dynamic param endpoint
        const itemRes = await makeHttpRequest("http://localhost:5350/items/item_abc123");
        expect(itemRes.status).toBe(200);
        expect(JSON.parse(itemRes.body)).toEqual({ item: "item_abc123" });
      } finally {
        if (startRes.runnerResult?.app) {
          await startRes.runnerResult.app.close();
        }
      }
    },
  );
});

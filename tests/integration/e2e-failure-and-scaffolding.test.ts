import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleBuildCommand, handleStartCommand, runCli } from "../../packages/cli/src/index.js";
import { BUILD_OUTPUT_DIR } from "../../packages/core/src/index.js";

describe("Action 70.11 — Build/Start Failure & Package Manager Scaffolding Matrix", () => {
  let tempDir: string;
  let stdoutLogs: string[];
  let stderrLogs: string[];

  const customStdout = (msg: string) => stdoutLogs.push(msg);
  const customStderr = (msg: string) => stderrLogs.push(msg);

  beforeEach(() => {
    tempDir = join(tmpdir(), `forge-e2e-fail-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    stdoutLogs = [];
    stderrLogs = [];
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("1. Build Failure Matrix", () => {
    it(
      "fails cleanly and cleans staging when TypeScript compilation fails",
      { timeout: 15000 },
      async () => {
        writeFileSync(
          join(tempDir, "tsconfig.json"),
          JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext" } }),
        );
        mkdirSync(join(tempDir, "src", "app"), { recursive: true });
        writeFileSync(join(tempDir, "src", "app", "route.ts"), "EXPORT BROKEN TS SYNTAX {{{");

        const res = await handleBuildCommand([], { projectRoot: tempDir });

        expect(res.exitCode).toBe(1);
        expect(existsSync(join(tempDir, ".forge", "build-staging"))).toBe(false);
        expect(existsSync(join(tempDir, BUILD_OUTPUT_DIR))).toBe(false);
      },
    );

    it("fails cleanly when forge.config file has invalid configuration", async () => {
      writeFileSync(join(tempDir, "forge.config.js"), "export default { server: { port: -99 } };");

      const res = await handleBuildCommand([], { projectRoot: tempDir });

      expect(res.exitCode).toBe(1);
      expect(existsSync(join(tempDir, ".forge", "build-staging"))).toBe(false);
    });

    it("fails cleanly when filesystem route file has import errors", async () => {
      writeFileSync(join(tempDir, "package.json"), JSON.stringify({ type: "module" }));
      mkdirSync(join(tempDir, "src", "app"), { recursive: true });
      writeFileSync(
        join(tempDir, "src", "app", "route.js"),
        `import nonExistentModule from "non-existent-pkg-abc-123";`,
      );

      const res = await handleBuildCommand([], { projectRoot: tempDir });

      expect(res.exitCode).toBe(1);
      expect(existsSync(join(tempDir, ".forge", "build-staging"))).toBe(false);
    });
  });

  describe("2. Start Failure Matrix", () => {
    it("fails cleanly with exit code 1 when no build artifact exists", async () => {
      const res = await runCli(["start"], {
        projectRoot: tempDir,
        stdout: customStdout,
        stderr: customStderr,
      });

      expect(res.exitCode).toBe(1);
      expect(res.output).toContain("No production build found");
    });

    it("fails cleanly when manifest JSON is corrupted", async () => {
      const buildDir = join(tempDir, BUILD_OUTPUT_DIR);
      mkdirSync(buildDir, { recursive: true });
      writeFileSync(join(buildDir, "manifest.json"), "{ CORRUPT JSON");

      const res = await handleStartCommand([], {
        projectRoot: tempDir,
        stdout: customStdout,
        stderr: customStderr,
      });

      expect(res.exitCode).toBe(1);
      expect(res.output).toContain("manifest is invalid");
    });

    it("fails cleanly when format version is unsupported", async () => {
      const buildDir = join(tempDir, BUILD_OUTPUT_DIR);
      mkdirSync(buildDir, { recursive: true });
      const manifest = {
        metadata: {
          formatVersion: "999.0",
          forgeVersion: "0.1.0",
          builtAt: new Date().toISOString(),
          language: "typescript",
          configPath: "forge.config.js",
          appDir: "app",
        },
        routes: [],
      };
      writeFileSync(join(buildDir, "manifest.json"), JSON.stringify(manifest));

      const res = await handleStartCommand([], {
        projectRoot: tempDir,
        stdout: customStdout,
        stderr: customStderr,
      });

      expect(res.exitCode).toBe(1);
      expect(res.output).toContain("Unsupported production build format version '999.0'");
    });
  });

  describe("3. Package Manager & Scaffolding Matrix", () => {
    it("verifies package manager compatibility metadata for npm, pnpm, and yarn scaffolded projects", async () => {
      const pms = ["npm", "pnpm", "yarn"] as const;

      for (const pm of pms) {
        const pmDir = join(tempDir, `proj-${pm}`);
        mkdirSync(pmDir, { recursive: true });

        writeFileSync(
          join(pmDir, "package.json"),
          JSON.stringify({
            name: `app-${pm}`,
            type: "module",
            scripts: {
              build: "forge build",
              start: "forge start",
            },
            packageManager: `${pm}@1.0.0`,
          }),
        );
        writeFileSync(join(pmDir, "forge.config.js"), `export default { server: { port: 5400 } };`);
        mkdirSync(join(pmDir, "src", "app"), { recursive: true });
        writeFileSync(
          join(pmDir, "src", "app", "route.js"),
          `export const GET = (_req, res) => res.json({ pm: "${pm}" });`,
        );

        const buildRes = await handleBuildCommand([], { projectRoot: pmDir });
        expect(buildRes.exitCode).toBe(0);

        const startRes = await handleStartCommand([], {
          projectRoot: pmDir,
          attachSignalHandlers: false,
        });

        expect(startRes.exitCode).toBe(0);
        await startRes.runnerResult?.app.close();
      }
    });
  });
});

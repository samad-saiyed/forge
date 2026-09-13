import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleDevCommand, runCli, startDevServer } from "../../packages/cli/src/index.js";

describe("Forge CLI 'forge dev' Server & Lifecycle Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `forge-dev-test-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns exit code 3 when executed outside a Forge project directory", async () => {
    let errorOutput = "";
    const result = await runCli(["dev"], {
      cwd: tempDir,
      stderr: (msg) => {
        errorOutput += msg;
      },
    });

    expect(result.exitCode).toBe(3);
    expect(errorOutput).toContain("Forge project not found.");
    expect(errorOutput).toContain("Could not locate forge.config.ts");
    expect(errorOutput).toContain('Run "forge new <name>" to create a new project.');
  });

  it("starts the development server and discovers routes in a valid Forge project", async () => {
    // Setup Forge project
    writeFileSync(
      join(tempDir, "forge.config.ts"),
      `export default { server: { port: 4850, host: "127.0.0.1" } };`,
      "utf8",
    );
    mkdirSync(join(tempDir, "src", "app"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "route.ts"),
      `export const GET = (_req, res) => res.json({ status: "ok" });`,
      "utf8",
    );

    let output = "";
    const result = await handleDevCommand([], {
      projectRoot: tempDir,
      watch: false,
      stdout: (msg) => {
        output += msg + "\n";
      },
    });

    expect(result.exitCode).toBe(0);
    expect(output).toContain("Forge");
    expect(output).toContain("✓ Configuration loaded");
    expect(output).toContain("✓ Routes loaded");
    expect(output).toContain("✓ Server started");
    expect(output).toContain("Local: http://localhost:4850");
  });

  it("verifies HTTP requests to discovered routes on dev server", async () => {
    writeFileSync(
      join(tempDir, "forge.config.ts"),
      `export default { server: { port: 4851, host: "127.0.0.1" } };`,
      "utf8",
    );
    mkdirSync(join(tempDir, "src", "app", "users"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "users", "route.ts"),
      `export const GET = (_req, res) => res.json({ users: ["Alice", "Bob"] });`,
      "utf8",
    );

    const controller = await startDevServer({
      projectRoot: tempDir,
      watch: false,
    });

    expect(controller.url).toBe("http://localhost:4851");

    const res = await fetch("http://127.0.0.1:4851/users");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ users: ["Alice", "Bob"] });

    await controller.stop();
  });

  it("restarts cleanly when a route file is modified without port collision (EADDRINUSE)", async () => {
    writeFileSync(
      join(tempDir, "forge.config.ts"),
      `export default { server: { port: 4852, host: "127.0.0.1" } };`,
      "utf8",
    );
    mkdirSync(join(tempDir, "src", "app"), { recursive: true });
    const routePath = join(tempDir, "src", "app", "route.ts");
    writeFileSync(routePath, `export const GET = (_req, res) => res.json({ version: 1 });`, "utf8");

    let output = "";
    const controller = await startDevServer({
      projectRoot: tempDir,
      watch: false,
      stdout: (msg) => {
        output += msg + "\n";
      },
    });

    const res1 = await fetch("http://127.0.0.1:4852/");
    expect(await res1.json()).toEqual({ version: 1 });

    // Update route code and trigger restart
    writeFileSync(routePath, `export const GET = (_req, res) => res.json({ version: 2 });`, "utf8");

    await controller.restart();
    expect(output).toContain("File change detected. Restarting application...");

    const res2 = await fetch("http://127.0.0.1:4852/");
    expect(await res2.json()).toEqual({ version: 2 });

    await controller.stop();
  });

  it(
    "handles failed restart when route code has errors and recovers after fix",
    { timeout: 15000 },
    async () => {
      writeFileSync(
        join(tempDir, "forge.config.ts"),
        `export default { server: { port: 4853, host: "127.0.0.1" } };`,
        "utf8",
      );
      mkdirSync(join(tempDir, "src", "app"), { recursive: true });
      const routePath = join(tempDir, "src", "app", "route.ts");
      writeFileSync(
        routePath,
        `export const GET = (_req, res) => res.json({ state: "initial" });`,
        "utf8",
      );

      let stderrOutput = "";
      const controller = await startDevServer({
        projectRoot: tempDir,
        watch: false,
        stderr: (msg) => {
          stderrOutput += msg + "\n";
        },
      });

      // Introduce invalid code
      writeFileSync(routePath, `throw new Error("Syntax broken");`, "utf8");

      await controller.restart();
      expect(stderrOutput).toContain("Unable to start Forge server");

      // Fix the code and restart again
      writeFileSync(
        routePath,
        `export const GET = (_req, res) => res.json({ state: "recovered" });`,
        "utf8",
      );

      await controller.restart();

      const res = await fetch("http://127.0.0.1:4853/");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ state: "recovered" });

      await controller.stop();
    },
  );
});

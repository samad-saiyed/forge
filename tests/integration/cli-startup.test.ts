import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDev, runStart, runCliCommand } from "../../packages/cli/src/index.js";
import { createApp } from "../../packages/core/src/index.js";

describe("Kyuu CLI Startup Pipeline Integration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kyuu-cli-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("kyuu dev (runDev) discovers kyuu.config.ts automatically", async () => {
    writeFileSync(
      join(tempDir, "kyuu.config.ts"),
      `export default { server: { port: 4600, host: "127.0.0.1" } };`,
      "utf8",
    );

    const result = await runDev({ projectRoot: tempDir });
    expect(result.config.server.port).toBe(4600);
    expect(result.context.config.server.port).toBe(4600);
    expect(result.context.app.config.server.port).toBe(4600);
    expect(result.server.listening).toBe(true);

    await result.context.app.close();
  });

  it("kyuu start (runStart) discovers kyuu.config.ts automatically", async () => {
    writeFileSync(
      join(tempDir, "kyuu.config.ts"),
      `export default { server: { port: 4700, host: "127.0.0.1" } };`,
      "utf8",
    );

    const result = await runStart({ projectRoot: tempDir });
    expect(result.config.server.port).toBe(4700);
    expect(result.server.listening).toBe(true);

    await result.context.app.close();
  });

  it("kyuu dev and kyuu start work without a kyuu.config.ts file using defaults", async () => {
    const resultDev = await runDev({ projectRoot: tempDir });
    expect(resultDev.config.server.port).toBe(3000);
    expect(resultDev.config.server.host).toBe("127.0.0.1");
    expect(resultDev.server.listening).toBe(true);
    await resultDev.context.app.close();

    const resultStart = await runStart({ projectRoot: tempDir });
    expect(resultStart.config.server.port).toBe(3000);
    expect(resultStart.config.server.host).toBe("127.0.0.1");
    expect(resultStart.server.listening).toBe(true);
    await resultStart.context.app.close();
  });

  it("prevents startup and server creation when kyuu.config.ts is invalid", async () => {
    writeFileSync(
      join(tempDir, "kyuu.config.ts"),
      `export default { server: { port: "invalid-port" } };`,
      "utf8",
    );

    await expect(runDev({ projectRoot: tempDir })).rejects.toThrow(TypeError);
    await expect(runStart({ projectRoot: tempDir })).rejects.toThrow(TypeError);
  });

  it("propagates custom host and port to the HTTP server", async () => {
    writeFileSync(
      join(tempDir, "kyuu.config.ts"),
      `export default { server: { host: "127.0.0.1", port: 0 } };`,
      "utf8",
    );

    const result = await runDev({ projectRoot: tempDir });
    expect(result.config.server.host).toBe("127.0.0.1");
    expect(result.server.listening).toBe(true);

    await result.context.app.close();
  });

  it("delegates runDev and runStart through common runCliCommand startup helper", async () => {
    const resultCli = await runCliCommand("development", { projectRoot: tempDir });
    expect(resultCli.context).toBeDefined();
    expect(resultCli.server).toBeDefined();
    expect(resultCli.server.listening).toBe(true);

    await resultCli.context.app.close();
  });

  it("preserves direct programmatic createApp() without reading filesystem config", () => {
    writeFileSync(
      join(tempDir, "kyuu.config.ts"),
      `export default { server: { port: 9999 } };`,
      "utf8",
    );

    const app = createApp({ server: { port: 4000 } });
    expect(app.config.server.port).toBe(4000);
  });
});

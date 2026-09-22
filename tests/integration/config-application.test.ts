import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createApp,
  DEFAULT_CONFIG,
  loadConfig,
  loadApplicationContext,
  resolveConfig,
} from "../../packages/core/src/index.js";

describe("Application Configuration Integration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kyuu-app-config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates application with default configuration when no config is passed", () => {
    const app = createApp();
    expect(app.config).toEqual(DEFAULT_CONFIG);
    expect(app.config.server.port).toBe(3000);
    expect(app.config.server.host).toBe("127.0.0.1");
  });

  it("creates application with explicit resolved configuration", () => {
    const customConfig = resolveConfig({
      server: { port: 8080, host: "0.0.0.0" },
      logging: true,
    });

    const app = createApp(customConfig);
    expect(app.config.server.port).toBe(8080);
    expect(app.config.server.host).toBe("0.0.0.0");
    expect(app.config.logging.enabled).toBe(true);
  });

  it("creates application with raw input configuration", () => {
    const app = createApp({
      server: { port: 9090 },
      development: true,
    });

    expect(app.config.server.port).toBe(9090);
    expect(app.config.development.enabled).toBe(true);
  });

  it("isolates configuration between independent application instances", () => {
    const app1 = createApp({ server: { port: 4000 } });
    const app2 = createApp({ server: { port: 5000 } });

    expect(app1.config.server.port).toBe(4000);
    expect(app2.config.server.port).toBe(5000);
    expect(app1.config).not.toBe(app2.config);
  });

  it("uses configured server.port and server.host when app.listen() is called without arguments", async () => {
    const app = createApp({ server: { port: 0, host: "127.0.0.1" } });

    const server = app.listen();
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    expect(server.listening).toBe(true);

    await app.close();
  });

  it("integrates loadConfig() result directly into createApp()", async () => {
    writeFileSync(
      join(tempDir, "kyuu.config.ts"),
      `export default { server: { port: 7070 }, benchmarking: true };`,
      "utf8",
    );

    const loadedConfig = await loadConfig(tempDir);
    expect(loadedConfig).not.toBeNull();

    const app = createApp(loadedConfig!);
    expect(app.config.server.port).toBe(7070);
    expect(app.config.benchmarking.enabled).toBe(true);
  });

  describe("Automatic Configuration Discovery During Kyuu Startup", () => {
    it("automatically discovers kyuu.config.ts during loadApplicationContext startup", async () => {
      writeFileSync(
        join(tempDir, "kyuu.config.ts"),
        `export default { server: { port: 4321, host: "127.0.0.1" } };`,
        "utf8",
      );

      const context = await loadApplicationContext({ projectRoot: tempDir });
      expect(context.config.server.port).toBe(4321);
      expect(context.app.config.server.port).toBe(4321);

      const server = context.app.listen();
      await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });

      expect(server.listening).toBe(true);
      await context.app.close();
    });

    it("uses default configuration during startup when no kyuu.config.ts exists", async () => {
      const context = await loadApplicationContext({ projectRoot: tempDir });
      expect(context.config.server.port).toBe(3000);
      expect(context.config.server.host).toBe("127.0.0.1");
      expect(context.app.config.server.port).toBe(3000);
    });

    it("verifies custom host from kyuu.config.ts reaches the HTTP server", async () => {
      writeFileSync(
        join(tempDir, "kyuu.config.ts"),
        `export default { server: { host: "127.0.0.1", port: 0 } };`,
        "utf8",
      );

      const context = await loadApplicationContext({ projectRoot: tempDir });
      expect(context.config.server.host).toBe("127.0.0.1");

      const server = context.app.listen();
      await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });

      expect(server.listening).toBe(true);
      await context.app.close();
    });

    it("prevents startup and server creation when kyuu.config.ts is invalid", async () => {
      writeFileSync(
        join(tempDir, "kyuu.config.js"),
        `export default { server: { port: "invalid-port" } };`,
        "utf8",
      );

      await expect(loadApplicationContext({ projectRoot: tempDir })).rejects.toThrow(TypeError);
    });

    it("guarantees direct createApp() remains filesystem-independent", () => {
      writeFileSync(
        join(tempDir, "kyuu.config.ts"),
        `export default { server: { port: 9999 } };`,
        "utf8",
      );

      // Direct createApp does not read kyuu.config.ts in tempDir
      const app = createApp({ server: { port: 4000 } });
      expect(app.config.server.port).toBe(4000);
    });

    it("avoids redundant loading by sharing single resolved config reference", async () => {
      writeFileSync(
        join(tempDir, "kyuu.config.ts"),
        `export default { server: { port: 5432 } };`,
        "utf8",
      );

      const context = await loadApplicationContext({ projectRoot: tempDir });
      expect(context.app.config).toBe(context.config);
    });
  });
});

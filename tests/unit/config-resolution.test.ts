import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, DEFAULT_CONFIG } from "../../packages/core/src/index.js";

describe("Configuration Resolution and Validation (loadConfig)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "forge-config-res-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns default configuration when no config file exists in directory", async () => {
    const config = await loadConfig(tempDir);
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(config.server.port).toBe(3000);
    expect(config.server.host).toBe("127.0.0.1");
    expect(config.logging.enabled).toBe(false);
  });

  it("fills in defaults for partial configuration", async () => {
    writeFileSync(
      join(tempDir, "forge.config.ts"),
      `export default { server: { port: 4000 } };`,
      "utf8",
    );

    const config = await loadConfig(tempDir);
    expect(config.server.port).toBe(4000);
    expect(config.server.host).toBe("127.0.0.1");
    expect(config.logging.enabled).toBe(false);
    expect(config.logging.level).toBe("info");
    expect(config.benchmarking.enabled).toBe(false);
    expect(config.development.enabled).toBe(false);
  });

  it("preserves values for complete configuration", async () => {
    writeFileSync(
      join(tempDir, "forge.config.ts"),
      `
      export default {
        server: { port: 8080, host: "0.0.0.0" },
        logging: { enabled: true, level: "debug" },
        benchmarking: { enabled: true },
        development: { enabled: true, debug: true }
      };
      `,
      "utf8",
    );

    const config = await loadConfig(tempDir);
    expect(config.server.port).toBe(8080);
    expect(config.server.host).toBe("0.0.0.0");
    expect(config.logging.enabled).toBe(true);
    expect(config.logging.level).toBe("debug");
    expect(config.benchmarking.enabled).toBe(true);
    expect(config.development.enabled).toBe(true);
    expect(config.development.debug).toBe(true);
  });

  it("rejects invalid server port string", async () => {
    writeFileSync(
      join(tempDir, "forge.config.js"),
      `export default { server: { port: "3000" } };`,
      "utf8",
    );

    await expect(loadConfig(tempDir)).rejects.toThrow(TypeError);
    await expect(loadConfig(tempDir)).rejects.toThrow(
      "Configuration option 'server.port' must be a valid integer between 0 and 65535.",
    );
  });

  it("rejects invalid server port range", async () => {
    writeFileSync(
      join(tempDir, "forge.config.js"),
      `export default { server: { port: 99999 } };`,
      "utf8",
    );

    await expect(loadConfig(tempDir)).rejects.toThrow(TypeError);
  });

  it("rejects invalid option types for logging and development", async () => {
    writeFileSync(
      join(tempDir, "forge.config.js"),
      `export default { logging: "invalid-boolean" };`,
      "utf8",
    );

    await expect(loadConfig(tempDir)).rejects.toThrow(TypeError);
  });

  it("rejects invalid configuration structure and unknown options", async () => {
    writeFileSync(
      join(tempDir, "forge.config.js"),
      `export default { unknownOption: 123 };`,
      "utf8",
    );

    await expect(loadConfig(tempDir)).rejects.toThrow(TypeError);
  });

  it("produces expected resolved shape from valid defineConfig output", async () => {
    const indexPath = pathToFileURL(resolve("packages/core/src/index.ts")).href;
    writeFileSync(
      join(tempDir, "forge.config.ts"),
      `
      import { defineConfig } from "${indexPath}";
      export default defineConfig({
        server: { port: 5000 },
        logging: true,
        development: true
      });
      `,
      "utf8",
    );

    const config = await loadConfig(tempDir);
    expect(config.server.port).toBe(5000);
    expect(config.logging.enabled).toBe(true);
    expect(config.development.enabled).toBe(true);
    expect(config.development.debug).toBe(true);
  });
});

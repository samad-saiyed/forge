import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findConfigFile, loadConfigFile } from "../../packages/core/src/index.js";

describe("Configuration File Loader", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kyuu-config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns null when no configuration file is found", async () => {
    const file = findConfigFile(tempDir);
    expect(file).toBeNull();

    const config = await loadConfigFile(tempDir);
    expect(config).toBeNull();
  });

  it("discovers and loads kyuu.config.ts", async () => {
    const configPath = join(tempDir, "kyuu.config.ts");
    writeFileSync(
      configPath,
      `export default { server: { port: 8080, host: "0.0.0.0" } };`,
      "utf8",
    );

    const found = findConfigFile(tempDir);
    expect(found).toBe(configPath);

    const loaded = await loadConfigFile(tempDir);
    expect(loaded).toEqual({ server: { port: 8080, host: "0.0.0.0" } });
  });

  it("discovers and loads kyuu.config.js", async () => {
    const configPath = join(tempDir, "kyuu.config.js");
    writeFileSync(configPath, `export default { logging: true };`, "utf8");

    const found = findConfigFile(tempDir);
    expect(found).toBe(configPath);

    const loaded = await loadConfigFile(tempDir);
    expect(loaded).toEqual({ logging: true });
  });

  it("discovers and loads kyuu.config.mjs", async () => {
    const configPath = join(tempDir, "kyuu.config.mjs");
    writeFileSync(configPath, `export default { benchmarking: true };`, "utf8");

    const found = findConfigFile(tempDir);
    expect(found).toBe(configPath);

    const loaded = await loadConfigFile(tempDir);
    expect(loaded).toEqual({ benchmarking: true });
  });

  it("throws an error when multiple config files create ambiguity", async () => {
    writeFileSync(join(tempDir, "kyuu.config.ts"), `export default { server: { port: 1111 } };`);
    writeFileSync(join(tempDir, "kyuu.config.js"), `export default { server: { port: 2222 } };`);

    expect(() => findConfigFile(tempDir)).toThrow(/Multiple configuration files found/i);
    await expect(loadConfigFile(tempDir)).rejects.toThrow(/Multiple configuration files found/i);
  });

  it("throws an error when config file has no default export", async () => {
    writeFileSync(
      join(tempDir, "kyuu.config.ts"),
      `export const config = { server: { port: 3000 } };`,
    );

    await expect(loadConfigFile(tempDir)).rejects.toThrow(/default export/i);
  });

  it("throws an error when config module fails to load", async () => {
    writeFileSync(join(tempDir, "kyuu.config.js"), `this is invalid javascript syntax !@#$`);

    await expect(loadConfigFile(tempDir)).rejects.toThrow(/Failed to load configuration file/i);
  });

  it("preserves configuration object values returned from loadConfigFile", async () => {
    const configPath = join(tempDir, "kyuu.config.ts");
    writeFileSync(
      configPath,
      `
      export default {
        server: { port: 5000, host: "localhost" },
        logging: { enabled: true, level: "debug" },
        development: true
      };
      `,
      "utf8",
    );

    const loaded = await loadConfigFile(tempDir);
    expect(loaded).toEqual({
      server: { port: 5000, host: "localhost" },
      logging: { enabled: true, level: "debug" },
      development: true,
    });
  });
});

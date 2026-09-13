import { describe, expect, it } from "vitest";
import {
  defineConfig,
  resolveConfig,
  validateConfig,
  DEFAULT_CONFIG,
  Application,
  createApp,
  type ForgeConfigInput,
  type ResolvedForgeConfig,
} from "../../packages/core/src/index.js";

describe("Configuration System Foundation", () => {
  it("accepts valid configuration via defineConfig()", () => {
    const config: ForgeConfigInput = defineConfig({
      server: {
        port: 8080,
        host: "0.0.0.0",
      },
      logging: true,
      benchmarking: false,
      development: {
        debug: true,
      },
    });

    expect(config.server?.port).toBe(8080);
    expect(config.server?.host).toBe("0.0.0.0");
    expect(config.logging).toBe(true);
    expect(config.benchmarking).toBe(false);
    expect(config.development).toEqual({ debug: true });
  });

  it("provides sensible defaults when no config is passed to resolveConfig()", () => {
    const resolved: ResolvedForgeConfig = resolveConfig();

    expect(resolved).toEqual(DEFAULT_CONFIG);
    expect(resolved.server.port).toBe(3000);
    expect(resolved.server.host).toBe("127.0.0.1");
    expect(resolved.logging.enabled).toBe(false);
    expect(resolved.logging.level).toBe("info");
    expect(resolved.benchmarking.enabled).toBe(false);
    expect(resolved.development.enabled).toBe(false);
    expect(resolved.development.debug).toBe(false);
  });

  it("merges partial configuration with defaults in resolveConfig()", () => {
    const resolved = resolveConfig({
      server: {
        port: 4000,
      },
      logging: {
        enabled: true,
      },
      development: true,
    });

    expect(resolved.server.port).toBe(4000);
    expect(resolved.server.host).toBe("127.0.0.1");
    expect(resolved.logging.enabled).toBe(true);
    expect(resolved.logging.level).toBe("info");
    expect(resolved.benchmarking.enabled).toBe(false);
    expect(resolved.development.enabled).toBe(true);
    expect(resolved.development.debug).toBe(true);
  });

  it("rejects invalid configuration inputs", () => {
    // Non-object config
    expect(() => validateConfig(null)).toThrow(TypeError);
    expect(() => validateConfig("string" as unknown)).toThrow(TypeError);

    // Invalid server.port
    expect(() => defineConfig({ server: { port: -1 } })).toThrow(TypeError);
    expect(() => defineConfig({ server: { port: 70000 } })).toThrow(TypeError);
    expect(() => defineConfig({ server: { port: "3000" as unknown as number } })).toThrow(
      TypeError,
    );

    // Invalid server.host
    expect(() => defineConfig({ server: { host: "" } })).toThrow(TypeError);
    expect(() => defineConfig({ server: { host: 123 as unknown as string } })).toThrow(TypeError);

    // Invalid logging option
    expect(() => defineConfig({ logging: "verbose" as unknown as boolean })).toThrow(TypeError);
    expect(() => defineConfig({ logging: { level: "invalid" as unknown as "info" } })).toThrow(
      TypeError,
    );

    // Invalid benchmarking option
    expect(() => defineConfig({ benchmarking: "false" as unknown as boolean })).toThrow(TypeError);

    // Invalid development option
    expect(() => defineConfig({ development: "true" as unknown as boolean })).toThrow(TypeError);

    // Unknown options
    expect(() => defineConfig({ invalidOption: true } as unknown as ForgeConfigInput)).toThrow(
      TypeError,
    );
    expect(() =>
      defineConfig({ server: { invalid: 123 } as unknown as ForgeConfigInput["server"] }),
    ).toThrow(TypeError);
  });

  it("ensures existing createApp() behavior remains unchanged without config file", () => {
    const app = createApp();
    expect(app).toBeDefined();
    expect(app).toBeInstanceOf(Application);
    expect((app as unknown as { state: string }).state).toBe("created");
  });
});

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface ServerConfig {
  port?: number;
  host?: string;
}

export interface LoggingOptions {
  enabled?: boolean;
  level?: "info" | "warn" | "error" | "debug";
}

export type LoggingConfig = boolean | LoggingOptions;

export interface BenchmarkingOptions {
  enabled?: boolean;
}

export type BenchmarkingConfig = boolean | BenchmarkingOptions;

export interface DevelopmentOptions {
  enabled?: boolean;
  debug?: boolean;
}

export type DevelopmentConfig = boolean | DevelopmentOptions;

export interface KyuuConfigInput {
  server?: ServerConfig;
  logging?: LoggingConfig;
  benchmarking?: BenchmarkingConfig;
  development?: DevelopmentConfig;
}

export interface ResolvedServerConfig {
  port: number;
  host: string;
}

export interface ResolvedLoggingConfig {
  enabled: boolean;
  level: "info" | "warn" | "error" | "debug";
}

export interface ResolvedBenchmarkingConfig {
  enabled: boolean;
}

export interface ResolvedDevelopmentConfig {
  enabled: boolean;
  debug: boolean;
}

export interface ResolvedKyuuConfig {
  server: ResolvedServerConfig;
  logging: ResolvedLoggingConfig;
  benchmarking: ResolvedBenchmarkingConfig;
  development: ResolvedDevelopmentConfig;
}

export const DEFAULT_CONFIG: ResolvedKyuuConfig = Object.freeze({
  server: Object.freeze({
    port: 3000,
    host: "127.0.0.1",
  }),
  logging: Object.freeze({
    enabled: false,
    level: "info",
  }),
  benchmarking: Object.freeze({
    enabled: false,
  }),
  development: Object.freeze({
    enabled: false,
    debug: false,
  }),
});

const ALLOWED_ROOT_KEYS = new Set(["server", "logging", "benchmarking", "development"]);
const ALLOWED_SERVER_KEYS = new Set(["port", "host"]);
const ALLOWED_LOGGING_KEYS = new Set(["enabled", "level"]);
const ALLOWED_BENCHMARKING_KEYS = new Set(["enabled"]);
const ALLOWED_DEVELOPMENT_KEYS = new Set(["enabled", "debug"]);

export function validateConfig(config: unknown): asserts config is KyuuConfigInput {
  if (config === null || typeof config !== "object") {
    throw new TypeError("Configuration must be a non-null object.");
  }

  const cfg = config as Record<string, unknown>;

  for (const key of Object.keys(cfg)) {
    if (!ALLOWED_ROOT_KEYS.has(key)) {
      throw new TypeError(`Unknown configuration option '${key}'.`);
    }
  }

  if (cfg.server !== undefined) {
    if (cfg.server === null || typeof cfg.server !== "object") {
      throw new TypeError("Configuration option 'server' must be an object.");
    }
    const server = cfg.server as Record<string, unknown>;
    for (const key of Object.keys(server)) {
      if (!ALLOWED_SERVER_KEYS.has(key)) {
        throw new TypeError(`Unknown configuration option 'server.${key}'.`);
      }
    }
    if (server.port !== undefined) {
      if (
        typeof server.port !== "number" ||
        !Number.isInteger(server.port) ||
        server.port < 0 ||
        server.port > 65535
      ) {
        throw new TypeError(
          "Configuration option 'server.port' must be a valid integer between 0 and 65535.",
        );
      }
    }
    if (server.host !== undefined) {
      if (typeof server.host !== "string" || server.host.trim() === "") {
        throw new TypeError("Configuration option 'server.host' must be a non-empty string.");
      }
    }
  }

  if (cfg.logging !== undefined) {
    if (typeof cfg.logging !== "boolean") {
      if (cfg.logging === null || typeof cfg.logging !== "object") {
        throw new TypeError(
          "Configuration option 'logging' must be a boolean or a logging options object.",
        );
      }
      const logging = cfg.logging as Record<string, unknown>;
      for (const key of Object.keys(logging)) {
        if (!ALLOWED_LOGGING_KEYS.has(key)) {
          throw new TypeError(`Unknown configuration option 'logging.${key}'.`);
        }
      }
      if (logging.enabled !== undefined && typeof logging.enabled !== "boolean") {
        throw new TypeError("Configuration option 'logging.enabled' must be a boolean.");
      }
      if (logging.level !== undefined) {
        const validLevels = ["info", "warn", "error", "debug"];
        if (typeof logging.level !== "string" || !validLevels.includes(logging.level)) {
          throw new TypeError(
            `Configuration option 'logging.level' must be one of: ${validLevels.join(", ")}.`,
          );
        }
      }
    }
  }

  if (cfg.benchmarking !== undefined) {
    if (typeof cfg.benchmarking !== "boolean") {
      if (cfg.benchmarking === null || typeof cfg.benchmarking !== "object") {
        throw new TypeError(
          "Configuration option 'benchmarking' must be a boolean or a benchmarking options object.",
        );
      }
      const benchmarking = cfg.benchmarking as Record<string, unknown>;
      for (const key of Object.keys(benchmarking)) {
        if (!ALLOWED_BENCHMARKING_KEYS.has(key)) {
          throw new TypeError(`Unknown configuration option 'benchmarking.${key}'.`);
        }
      }
      if (benchmarking.enabled !== undefined && typeof benchmarking.enabled !== "boolean") {
        throw new TypeError("Configuration option 'benchmarking.enabled' must be a boolean.");
      }
    }
  }

  if (cfg.development !== undefined) {
    if (typeof cfg.development !== "boolean") {
      if (cfg.development === null || typeof cfg.development !== "object") {
        throw new TypeError(
          "Configuration option 'development' must be a boolean or a development options object.",
        );
      }
      const development = cfg.development as Record<string, unknown>;
      for (const key of Object.keys(development)) {
        if (!ALLOWED_DEVELOPMENT_KEYS.has(key)) {
          throw new TypeError(`Unknown configuration option 'development.${key}'.`);
        }
      }
      if (development.enabled !== undefined && typeof development.enabled !== "boolean") {
        throw new TypeError("Configuration option 'development.enabled' must be a boolean.");
      }
      if (development.debug !== undefined && typeof development.debug !== "boolean") {
        throw new TypeError("Configuration option 'development.debug' must be a boolean.");
      }
    }
  }
}

export function defineConfig(config: KyuuConfigInput): KyuuConfigInput {
  validateConfig(config);
  return config;
}

export function resolveConfig(config?: KyuuConfigInput | ResolvedKyuuConfig): ResolvedKyuuConfig {
  if (config === undefined) {
    return DEFAULT_CONFIG;
  }

  if (
    config !== null &&
    typeof config === "object" &&
    Object.isFrozen(config) &&
    "server" in config &&
    "logging" in config &&
    "benchmarking" in config &&
    "development" in config
  ) {
    return config as ResolvedKyuuConfig;
  }

  validateConfig(config);

  const server: ResolvedServerConfig = {
    port: config.server?.port ?? DEFAULT_CONFIG.server.port,
    host: config.server?.host ?? DEFAULT_CONFIG.server.host,
  };

  const logging: ResolvedLoggingConfig =
    typeof config.logging === "boolean"
      ? { enabled: config.logging, level: DEFAULT_CONFIG.logging.level }
      : {
          enabled: config.logging?.enabled ?? DEFAULT_CONFIG.logging.enabled,
          level: config.logging?.level ?? DEFAULT_CONFIG.logging.level,
        };

  const benchmarking: ResolvedBenchmarkingConfig =
    typeof config.benchmarking === "boolean"
      ? { enabled: config.benchmarking }
      : {
          enabled: config.benchmarking?.enabled ?? DEFAULT_CONFIG.benchmarking.enabled,
        };

  const development: ResolvedDevelopmentConfig =
    typeof config.development === "boolean"
      ? { enabled: config.development, debug: config.development }
      : {
          enabled: config.development?.enabled ?? DEFAULT_CONFIG.development.enabled,
          debug: config.development?.debug ?? DEFAULT_CONFIG.development.debug,
        };

  return Object.freeze({
    server: Object.freeze(server),
    logging: Object.freeze(logging),
    benchmarking: Object.freeze(benchmarking),
    development: Object.freeze(development),
  });
}

const SUPPORTED_CONFIG_FILES = ["kyuu.config.ts", "kyuu.config.js", "kyuu.config.mjs"] as const;

export function findConfigFile(cwd: string = process.cwd()): string | null {
  const absoluteDir = resolve(cwd);
  const foundFiles: string[] = [];

  for (const filename of SUPPORTED_CONFIG_FILES) {
    const fullPath = resolve(absoluteDir, filename);
    if (existsSync(fullPath)) {
      foundFiles.push(filename);
    }
  }

  if (foundFiles.length > 1) {
    throw new Error(
      `Multiple configuration files found (${foundFiles.join(", ")}). Please provide only one configuration file.`,
    );
  }

  if (foundFiles.length === 1) {
    return resolve(absoluteDir, foundFiles[0]);
  }

  return null;
}

export async function loadConfigFile(cwd: string = process.cwd()): Promise<KyuuConfigInput | null> {
  const filePath = findConfigFile(cwd);
  if (!filePath) {
    return null;
  }

  const fileUrl = pathToFileURL(filePath).href;

  let mod: Record<string, unknown>;
  try {
    mod = (await import(fileUrl)) as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load configuration file '${filePath}': ${message}`, {
      cause: err,
    });
  }

  if (!mod || !("default" in mod) || mod.default === undefined) {
    throw new Error(`Configuration file '${filePath}' does not contain a default export.`);
  }

  return mod.default as KyuuConfigInput;
}

export async function loadConfig(cwd: string = process.cwd()): Promise<ResolvedKyuuConfig> {
  const rawConfig = await loadConfigFile(cwd);
  if (rawConfig === null) {
    return resolveConfig();
  }

  validateConfig(rawConfig);
  return resolveConfig(rawConfig);
}

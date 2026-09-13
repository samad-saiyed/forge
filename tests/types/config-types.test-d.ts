import {
  defineConfig,
  resolveConfig,
  type ForgeConfigInput,
  type ResolvedForgeConfig,
  type ServerConfig,
  type LoggingConfig,
  type BenchmarkingConfig,
  type DevelopmentConfig,
} from "../../packages/core/src/index.js";

type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;

// 1. Check defineConfig return type and inference
const config = defineConfig({
  server: {
    port: 8080,
  },
  logging: true,
  benchmarking: false,
});

export const checkConfigType: AssertEqual<typeof config, ForgeConfigInput> = true;

// 2. Check explicit input type assignments
const explicitInput: ForgeConfigInput = {
  server: { port: 3000, host: "localhost" } as ServerConfig,
  logging: true as LoggingConfig,
  benchmarking: false as BenchmarkingConfig,
  development: { debug: true } as DevelopmentConfig,
};

export const checkExplicitInput: AssertEqual<typeof explicitInput, ForgeConfigInput> = true;
void explicitInput;

// 3. Check resolveConfig return type
const resolved = resolveConfig(config);
export const checkResolvedType: AssertEqual<typeof resolved, ResolvedForgeConfig> = true;

// 4. Check property access on ResolvedForgeConfig
const port: number = resolved.server.port;
const host: string = resolved.server.host;
const loggingEnabled: boolean = resolved.logging.enabled;
const loggingLevel: "info" | "warn" | "error" | "debug" = resolved.logging.level;
const benchmarkingEnabled: boolean = resolved.benchmarking.enabled;
const developmentEnabled: boolean = resolved.development.enabled;
const developmentDebug: boolean = resolved.development.debug;

void port;
void host;
void loggingEnabled;
void loggingLevel;
void benchmarkingEnabled;
void developmentEnabled;
void developmentDebug;

// 5. Verify invalid configuration types are caught by TypeScript compiler
// @ts-expect-error invalid port type (string instead of number)
defineConfig({ server: { port: "3000" } });

// @ts-expect-error invalid logging type
defineConfig({ logging: "always" });

// @ts-expect-error invalid logging level
defineConfig({ logging: { level: "verbose" } });

// @ts-expect-error invalid option name
defineConfig({ unknownOption: true });

import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createApp, type Application } from "./application.js";
import {
  BUILD_FORMAT_VERSION,
  BUILD_OUTPUT_DIR,
  getManifestPath,
  parseBuildManifest,
  type BuildManifest,
} from "./build.js";
import {
  loadConfig,
  resolveConfig,
  type KyuuConfigInput,
  type ResolvedKyuuConfig,
} from "./config.js";

export interface ProductionRunnerOptions {
  /** Target project root directory containing .kyuu/build */
  projectRoot: string;
  /** Port override for production HTTP server */
  port?: number;
  /** Host/interface override for production HTTP server */
  host?: string;
  /** If true, initializes the production application without calling app.listen() */
  skipListen?: boolean;
}

export interface ProductionRunnerResult {
  /** Resolved project root directory */
  projectRoot: string;
  /** Resolved production build directory (.kyuu/build) */
  buildDir: string;
  /** Configured Kyuu Application instance */
  app: Application;
  /** Node.js HTTP Server instance */
  server: Server;
  /** Resolved runtime configuration */
  config: ResolvedKyuuConfig;
  /** Loaded build manifest */
  manifest: BuildManifest;
}

export class ProductionArtifactError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProductionArtifactError";
  }
}

/**
 * Loads the compiled production application and registers filesystem route handlers from the manifest.
 */
export async function loadProductionApplication(options: ProductionRunnerOptions): Promise<{
  app: Application;
  manifest: BuildManifest;
  buildDir: string;
  runtimeConfig: ResolvedKyuuConfig;
}> {
  const projectRoot = resolve(options.projectRoot);
  const buildDir = join(projectRoot, BUILD_OUTPUT_DIR);
  const manifestPath = getManifestPath(projectRoot);

  // 1. Verify build manifest existence
  if (!existsSync(manifestPath)) {
    throw new ProductionArtifactError("No production build found. Run `kyuu build` first.");
  }

  // 2. Parse and validate manifest JSON
  let manifest: BuildManifest;
  try {
    const manifestContent = readFileSync(manifestPath, "utf8");
    manifest = parseBuildManifest(manifestContent);
  } catch (err) {
    throw new ProductionArtifactError(
      `Production build artifact manifest is invalid: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (manifest.metadata.formatVersion !== BUILD_FORMAT_VERSION) {
    throw new ProductionArtifactError(
      `Unsupported production build format version '${manifest.metadata.formatVersion}'. Expected '${BUILD_FORMAT_VERSION}'.`,
    );
  }

  // 3. Verify application directory and route module files exist on disk
  if (manifest.metadata.appDir) {
    const appDirPath = join(buildDir, manifest.metadata.appDir);
    if (
      !existsSync(appDirPath) &&
      !existsSync(join(buildDir, "app")) &&
      !existsSync(join(buildDir, "src", "app"))
    ) {
      throw new ProductionArtifactError(
        `Production application directory '${manifest.metadata.appDir}' referenced in manifest.json does not exist.`,
      );
    }
  }

  for (const route of manifest.routes) {
    let moduleFile = join(buildDir, route.modulePath);
    if (!existsSync(moduleFile) && existsSync(join(buildDir, "src", route.modulePath))) {
      moduleFile = join(buildDir, "src", route.modulePath);
    }
    if (!existsSync(moduleFile)) {
      throw new ProductionArtifactError(
        `Production route module '${route.modulePath}' referenced in manifest.json does not exist.`,
      );
    }
  }

  // 4. Load runtime configuration (prefer compiled config from build directory for portability)
  let runtimeConfig: ResolvedKyuuConfig;
  const compiledConfigPath = join(buildDir, manifest.metadata.configPath ?? "kyuu.config.js");
  if (!existsSync(compiledConfigPath) && existsSync(join(buildDir, "kyuu.config.js"))) {
    // fallback if kyuu.config.js exists in staging/build
  }
  if (existsSync(compiledConfigPath) || existsSync(join(buildDir, "kyuu.config.js"))) {
    const actualConfigPath = existsSync(compiledConfigPath)
      ? compiledConfigPath
      : join(buildDir, "kyuu.config.js");
    try {
      const configUrl = `${pathToFileURL(actualConfigPath).href}?t=${Date.now()}_${Math.random()}`;
      const mod = (await import(configUrl)) as Record<string, unknown>;
      const rawConfig = (
        mod.default && typeof mod.default === "object" && "default" in mod.default
          ? (mod.default as Record<string, unknown>).default
          : (mod.default ?? mod)
      ) as KyuuConfigInput;
      runtimeConfig = resolveConfig(rawConfig);
    } catch {
      runtimeConfig = await loadConfig(projectRoot);
    }
  } else {
    runtimeConfig = await loadConfig(projectRoot);
  }

  // 5. Instantiate Application instance (bypassing dev src/app scanning)
  let app: Application | undefined;

  // Check if compiled application index exports an app instance
  const potentialEntryPaths = [
    join(buildDir, "src", "index.js"),
    join(buildDir, "index.js"),
    join(buildDir, "src", "app.js"),
    join(buildDir, "app.js"),
  ];

  for (const entryPath of potentialEntryPaths) {
    if (existsSync(entryPath)) {
      try {
        const entryUrl = `${pathToFileURL(entryPath).href}?t=${Date.now()}_${Math.random()}`;
        const mod = (await import(entryUrl)) as Record<string, unknown>;
        const exportedApp = mod.app ?? mod.default;
        if (exportedApp && typeof exportedApp === "object" && "listen" in exportedApp) {
          app = exportedApp as Application;
          break;
        }
      } catch {
        // Ignore import errors for index entry file, fallback to createApp
      }
    }
  }

  if (!app) {
    app = createApp({
      config: runtimeConfig,
      skipFsRouting: true,
    });
  }

  // 6. Consume manifest routes and register handlers on Application instance
  for (const route of manifest.routes) {
    let moduleFile = join(buildDir, route.modulePath);
    if (!existsSync(moduleFile) && existsSync(join(buildDir, "src", route.modulePath))) {
      moduleFile = join(buildDir, "src", route.modulePath);
    }

    let routeMod: Record<string, unknown>;
    try {
      const routeUrl = `${pathToFileURL(moduleFile).href}?t=${Date.now()}_${Math.random()}`;
      routeMod = (await import(routeUrl)) as Record<string, unknown>;
    } catch (err) {
      throw new ProductionArtifactError(
        `Failed to import production route module '${route.modulePath}': ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }

    const handler = routeMod[route.method];
    if (typeof handler !== "function") {
      throw new ProductionArtifactError(
        `Route module '${route.modulePath}' does not export a valid function for HTTP method '${route.method}'.`,
      );
    }

    const methodKey = route.method.toLowerCase() as keyof Application;
    if (typeof app[methodKey] === "function") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      (app[methodKey] as Function)(route.pattern, handler);
    } else {
      throw new ProductionArtifactError(
        `Unsupported HTTP method '${route.method}' for route '${route.pattern}'.`,
      );
    }
  }

  return {
    app,
    manifest,
    buildDir,
    runtimeConfig,
  };
}

/**
 * Starts a production server using the compiled build artifact in .kyuu/build.
 */
export async function startProductionServer(
  options: ProductionRunnerOptions,
): Promise<ProductionRunnerResult> {
  const projectRoot = resolve(options.projectRoot);
  const { app, manifest, buildDir, runtimeConfig } = await loadProductionApplication(options);

  const targetPort = options.port ?? runtimeConfig.server.port;
  const targetHost = options.host ?? runtimeConfig.server.host;

  const effectiveConfig: ResolvedKyuuConfig = {
    ...runtimeConfig,
    server: {
      ...runtimeConfig.server,
      port: targetPort,
      host: targetHost,
    },
  };

  if (options.skipListen) {
    return {
      projectRoot,
      buildDir,
      app,
      server: app["server"],
      config: effectiveConfig,
      manifest,
    };
  }

  const server = app.listen(targetPort, targetHost);

  if (!server.listening) {
    await new Promise<void>((res, rej) => {
      server.once("listening", res);
      server.once("error", (err) =>
        rej(
          new ProductionArtifactError(
            `Failed to start production HTTP server on port ${targetPort}: ${err.message}`,
            { cause: err },
          ),
        ),
      );
    });
  }

  return {
    projectRoot,
    buildDir,
    app,
    server,
    config: effectiveConfig,
    manifest,
  };
}

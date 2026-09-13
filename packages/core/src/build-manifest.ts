import * as fs from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
  BUILD_FORMAT_VERSION,
  formatBuildManifest,
  validateBuildManifest,
  type BuildManifest,
  type BuildRouteEntry,
} from "./build.js";

export interface GenerateManifestOptions {
  projectRoot: string;
  stagingDir: string;
  language: "typescript" | "javascript";
  configPathRelative: string;
  routes: BuildRouteEntry[];
  forgeVersion?: string;
}

export class ManifestGenerationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ManifestGenerationError";
  }
}

/**
 * Generates, validates, and writes the production build manifest.json into the staging directory.
 */
export async function generateBuildManifest(
  options: GenerateManifestOptions,
): Promise<BuildManifest> {
  const stagingDir = resolve(options.stagingDir);
  const forgeVersion = options.forgeVersion ?? "0.1.0";

  // Ensure deterministic route ordering (sorted by pattern then method)
  const sortedRoutes = [...options.routes].sort((a, b) => {
    const patternCompare = a.pattern.localeCompare(b.pattern);
    if (patternCompare !== 0) return patternCompare;
    return a.method.localeCompare(b.method);
  });

  // Validate module paths are relative and do not escape build output
  for (const route of sortedRoutes) {
    if (isAbsolute(route.modulePath) || route.modulePath.startsWith("..")) {
      throw new ManifestGenerationError(
        `Invalid modulePath '${route.modulePath}' in route entry. Paths in manifest must be build-relative.`,
      );
    }
  }

  const manifest: BuildManifest = {
    metadata: {
      formatVersion: BUILD_FORMAT_VERSION,
      forgeVersion,
      builtAt: new Date().toISOString(),
      language: options.language,
      configPath: options.configPathRelative,
      appDir: "app",
    },
    routes: sortedRoutes,
  };

  try {
    validateBuildManifest(manifest);
  } catch (err) {
    throw new ManifestGenerationError(
      `Build manifest validation failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  const jsonContent = formatBuildManifest(manifest);
  const manifestPath = join(stagingDir, "manifest.json");

  try {
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(manifestPath, jsonContent, "utf8");
  } catch (err) {
    throw new ManifestGenerationError(
      `Failed to write manifest.json to staging directory: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  return manifest;
}

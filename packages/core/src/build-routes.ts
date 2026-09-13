import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { mapSourceToBuildPath, toPosixPath, type BuildRouteEntry } from "./build.js";
import { loadRouteModule } from "./route-loader.js";
import { scanRouteFiles } from "./route-scanner.js";

export interface DiscoverBuildRoutesOptions {
  projectRoot: string;
  stagingDir?: string;
  language?: "typescript" | "javascript";
}

/**
 * Discovers production filesystem route entries from a project's application source tree.
 */
export async function discoverBuildRouteEntries(
  options: DiscoverBuildRoutesOptions,
): Promise<BuildRouteEntry[]> {
  const projectRoot = resolve(options.projectRoot);
  const language = options.language ?? "typescript";

  let appDir = join(projectRoot, "src", "app");
  if (!existsSync(appDir)) {
    appDir = join(projectRoot, "app");
    if (!existsSync(appDir)) {
      return [];
    }
  }

  const discoveredFiles = scanRouteFiles({ appDir });
  const entries: BuildRouteEntry[] = [];

  for (const discovered of discoveredFiles) {
    const relSourcePath = toPosixPath(relative(projectRoot, discovered.filePath));

    let importFilePath = discovered.filePath;
    if (options.stagingDir) {
      const relBuildPath = mapSourceToBuildPath(relSourcePath, language);
      let stagingFilePath = join(resolve(options.stagingDir), relBuildPath);
      if (
        !existsSync(stagingFilePath) &&
        existsSync(join(resolve(options.stagingDir), "src", relBuildPath))
      ) {
        stagingFilePath = join(resolve(options.stagingDir), "src", relBuildPath);
      }
      if (existsSync(stagingFilePath)) {
        importFilePath = stagingFilePath;
      }
    }

    const loadedModule = await loadRouteModule({
      filePath: importFilePath,
      routePath: discovered.routePath,
    });

    const modulePath = mapSourceToBuildPath(relSourcePath, language);

    for (const [method] of loadedModule.handlers) {
      entries.push({
        method,
        pattern: discovered.routePath,
        sourcePath: relSourcePath,
        modulePath,
      });
    }
  }

  entries.sort((a, b) => {
    const patternCompare = a.pattern.localeCompare(b.pattern);
    if (patternCompare !== 0) return patternCompare;
    return a.method.localeCompare(b.method);
  });

  return entries;
}

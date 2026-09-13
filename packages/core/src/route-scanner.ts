import * as fs from "node:fs";
import * as path from "node:path";
import { isRouteFile, resolveRoutePath } from "./filesystem-router.js";

export interface DiscoveredRouteFile {
  filePath: string;
  routePath: string;
}

export interface RouteScannerOptions {
  appDir: string;
}

export function scanRouteFiles(options: RouteScannerOptions): DiscoveredRouteFile[] {
  const { appDir } = options;

  if (!fs.existsSync(appDir)) {
    throw new Error(`App directory "${appDir}" does not exist.`);
  }

  const stat = fs.statSync(appDir);
  if (!stat.isDirectory()) {
    throw new Error(`App directory "${appDir}" is not a directory.`);
  }

  const discoveredRoutes: DiscoveredRouteFile[] = [];

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith("_")) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && isRouteFile(fullPath)) {
        const routePath = resolveRoutePath(fullPath, appDir);
        if (routePath !== null) {
          discoveredRoutes.push({
            filePath: fullPath,
            routePath,
          });
        }
      }
    }
  }

  walk(appDir);

  discoveredRoutes.sort((a, b) => {
    const pathCompare = a.routePath.localeCompare(b.routePath);
    if (pathCompare !== 0) {
      return pathCompare;
    }
    return a.filePath.localeCompare(b.filePath);
  });

  return discoveredRoutes;
}

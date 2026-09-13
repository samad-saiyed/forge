import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { RouteHandler } from "./application.js";
import type { FileRouteHandler } from "./context.js";

export interface FileRoute {
  method: string;
  path: string;
  handler: FileRouteHandler | RouteHandler;
  filePath: string;
}

export interface FileRouterOptions {
  root: string;
}

const SUPPORTED_HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
]);

import { isRouteFile, resolveRoutePath } from "./filesystem-router.js";
import { isRouteDefinition } from "./route-definition.js";

async function collectRouteFiles(
  rootDir: string,
  currentDir: string,
): Promise<{ filePath: string; relDir: string }[]> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const results: { filePath: string; relDir: string }[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith("_")) {
      continue;
    }

    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      const subResults = await collectRouteFiles(rootDir, fullPath);
      results.push(...subResults);
    } else if (entry.isFile() && isRouteFile(entry.name)) {
      const relDir = path.relative(rootDir, currentDir);
      results.push({ filePath: fullPath, relDir });
    }
  }

  return results;
}

export async function discoverRoutes(options: FileRouterOptions): Promise<FileRoute[]> {
  const root = path.resolve(options.root);

  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const routeFiles = await collectRouteFiles(root, root);
  const routes: FileRoute[] = [];

  for (const { filePath } of routeFiles) {
    const routePath = resolveRoutePath(filePath, root)!;
    const fileUrl = pathToFileURL(filePath).href;

    let moduleExports: Record<string, unknown>;
    try {
      moduleExports = await import(fileUrl);
    } catch (err) {
      throw new Error(
        `Failed to import route module at "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }

    for (const [exportName, exportValue] of Object.entries(moduleExports)) {
      if (SUPPORTED_HTTP_METHODS.has(exportName)) {
        let handler: FileRouteHandler | RouteHandler;
        if (isRouteDefinition(exportValue)) {
          handler = exportValue.handler as FileRouteHandler | RouteHandler;
        } else if (typeof exportValue === "function") {
          handler = exportValue as FileRouteHandler | RouteHandler;
        } else {
          throw new Error(
            `Invalid route handler for ${exportName} in "${filePath}": expected function or route definition, got ${typeof exportValue}`,
          );
        }

        routes.push({
          method: exportName,
          path: routePath,
          handler,
          filePath,
        });
      }
    }
  }

  return routes;
}

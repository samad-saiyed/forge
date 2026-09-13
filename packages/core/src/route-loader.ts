import { pathToFileURL } from "node:url";
import type { RouteHandler } from "./application.js";
import type { FileRouteHandler } from "./context.js";

import { isRouteDefinition, type RouteDefinition } from "./route-definition.js";
import type { DiscoveredRouteFile } from "./route-scanner.js";

export interface LoadedRouteModule {
  filePath: string;
  routePath: string;
  handlers: Map<string, RouteHandler | FileRouteHandler | RouteDefinition>;
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

export async function loadRouteModule(discovered: DiscoveredRouteFile): Promise<LoadedRouteModule> {
  const { filePath, routePath } = discovered;
  const fileUrl = pathToFileURL(filePath).href;

  let rawModule: unknown;
  try {
    rawModule = await import(fileUrl);
  } catch (err) {
    throw new Error(
      `Failed to import route module at "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  const moduleExports =
    typeof rawModule === "object" && rawModule !== null
      ? (rawModule as Record<string, unknown>)
      : {};

  const handlers = new Map<string, RouteHandler | FileRouteHandler | RouteDefinition>();

  for (const [exportName, exportValue] of Object.entries(moduleExports)) {
    const upperMethod = exportName.toUpperCase();
    if (SUPPORTED_HTTP_METHODS.has(upperMethod)) {
      if (typeof exportValue === "function" || isRouteDefinition(exportValue)) {
        handlers.set(upperMethod, exportValue as RouteHandler | FileRouteHandler | RouteDefinition);
      } else {
        throw new Error(
          `Invalid handler for HTTP method "${upperMethod}" in route module "${filePath}": expected function or route definition, got ${typeof exportValue}`,
        );
      }
    }
  }

  return {
    filePath,
    routePath,
    handlers,
  };
}

export async function loadRouteModules(
  discoveredList: DiscoveredRouteFile[],
): Promise<LoadedRouteModule[]> {
  const loadedRoutes: LoadedRouteModule[] = [];
  for (const discovered of discoveredList) {
    const loaded = await loadRouteModule(discovered);
    loadedRoutes.push(loaded);
  }
  return loadedRoutes;
}

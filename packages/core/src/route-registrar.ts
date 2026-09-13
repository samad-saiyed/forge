import type { Application, RouteHandler } from "./application.js";
import type { FileRouteHandler } from "./context.js";
import type { LoadedRouteModule } from "./route-loader.js";
import type { Router } from "./router.js";

export function registerLoadedRoutes(
  router: Router,
  loadedRoutes: LoadedRouteModule[],
  app?: Application,
): void {
  for (const loaded of loadedRoutes) {
    const { filePath, routePath, handlers } = loaded;

    for (const [method, rawHandler] of handlers.entries()) {
      const adaptedHandler: RouteHandler = (req, res, next) => {
        if (rawHandler.length <= 1) {
          return (rawHandler as FileRouteHandler)({
            app: app!,
            request: req,
            response: res,
          });
        }
        return (rawHandler as RouteHandler)(req, res, next);
      };

      router.add(method, routePath, adaptedHandler, undefined, undefined, filePath);
    }
  }
}

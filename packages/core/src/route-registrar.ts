import type { Application, RouteHandler } from "./application.js";
import type { FileRouteHandler } from "./context.js";
import { executeRouteValidation, isRouteDefinition } from "./route-definition.js";
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
      const isDef = isRouteDefinition(rawHandler);
      const targetHandler = isDef ? rawHandler.handler : rawHandler;
      const options = isDef ? rawHandler.options : undefined;

      const adaptedHandler: RouteHandler = async (req, res, next) => {
        if (options?.validate) {
          await executeRouteValidation(options, req);
        }
        if (targetHandler.length <= 1) {
          return (targetHandler as FileRouteHandler)({
            app: app!,
            request: req,
            response: res,
          });
        }
        return (targetHandler as RouteHandler)(req, res, next);
      };

      router.add(method, routePath, adaptedHandler, undefined, undefined, filePath);
    }
  }
}

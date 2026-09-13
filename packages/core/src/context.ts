import type { Application } from "./application.js";
import type { Request } from "./request.js";
import type { Response } from "./response.js";

export interface ApplicationContext {
  app: Application;
}

export interface RouteContext<
  Params = Record<string, string>,
  Query = Record<string, string | string[]>,
  Body = unknown,
  ResBody = unknown,
> {
  app: Application;
  request: Request<Params, Query, Body>;
  response: Response<ResBody>;
}

export type FileRouteHandler<
  Params = Record<string, string>,
  Query = Record<string, string | string[]>,
  Body = unknown,
  ResBody = unknown,
> = (context: RouteContext<Params, Query, Body, ResBody>) => void | Promise<void>;

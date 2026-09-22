import { resolve } from "node:path";
import { createApp, Application } from "./application.js";
import {
  loadConfig,
  resolveConfig,
  type KyuuConfigInput,
  type ResolvedKyuuConfig,
} from "./config.js";
import type { Request } from "./request.js";
import type { Response } from "./response.js";

export interface ApplicationContext {
  app: Application;
  config: ResolvedKyuuConfig;
}

export interface ApplicationContextOptions {
  appDir?: string;
  config?: ResolvedKyuuConfig | KyuuConfigInput;
}

export function createApplicationContext(options?: ApplicationContextOptions): ApplicationContext {
  const resolvedConfig = resolveConfig(options?.config);
  const app = createApp({
    appDir: options?.appDir,
    config: resolvedConfig,
  });

  return {
    app,
    config: resolvedConfig,
  };
}

export interface LoadApplicationContextOptions {
  projectRoot?: string;
  appDir?: string;
  config?: ResolvedKyuuConfig | KyuuConfigInput;
}

export async function loadApplicationContext(
  options?: LoadApplicationContextOptions,
): Promise<ApplicationContext> {
  const projectRoot = options?.projectRoot ? resolve(options.projectRoot) : process.cwd();

  const resolvedConfig =
    options?.config !== undefined ? resolveConfig(options.config) : await loadConfig(projectRoot);

  const appDir = options?.appDir ?? resolve(projectRoot, "src/app");

  return createApplicationContext({
    appDir,
    config: resolvedConfig,
  });
}

import type { IncomingHttpHeaders } from "node:http";

export interface RouteContext<
  Params = Record<string, string>,
  Query = Record<string, string | string[]>,
  Body = unknown,
  ResBody = unknown,
  Headers = IncomingHttpHeaders,
> {
  app: Application;
  request: Request<Params, Query, Body, Headers>;
  response: Response<ResBody>;
}

export type FileRouteHandler<
  Params = Record<string, string>,
  Query = Record<string, string | string[]>,
  Body = unknown,
  ResBody = unknown,
  Headers = IncomingHttpHeaders,
> = (context: RouteContext<Params, Query, Body, ResBody, Headers>) => void | Promise<unknown>;

import type { ParseFilesystemRouteParams } from "./filesystem-router.js";

export type FilesystemRouteHandler<
  Path extends string = string,
  Query = Record<string, string | string[]>,
  Body = unknown,
  ResBody = unknown,
  Headers = IncomingHttpHeaders,
> = FileRouteHandler<ParseFilesystemRouteParams<Path>, Query, Body, ResBody, Headers>;

export function defineRouteHandler<
  Path extends string = string,
  Query = Record<string, string | string[]>,
  Body = unknown,
  ResBody = unknown,
  Headers = IncomingHttpHeaders,
>(
  handler: FileRouteHandler<ParseFilesystemRouteParams<Path>, Query, Body, ResBody, Headers>,
): FileRouteHandler<ParseFilesystemRouteParams<Path>, Query, Body, ResBody, Headers> {
  return handler;
}

import { resolve } from "node:path";
import { createApp, Application } from "./application.js";
import {
  loadConfig,
  resolveConfig,
  type ForgeConfigInput,
  type ResolvedForgeConfig,
} from "./config.js";
import type { Request } from "./request.js";
import type { Response } from "./response.js";

export interface ApplicationContext {
  app: Application;
  config: ResolvedForgeConfig;
}

export interface ApplicationContextOptions {
  appDir?: string;
  config?: ResolvedForgeConfig | ForgeConfigInput;
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
  config?: ResolvedForgeConfig | ForgeConfigInput;
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

import type { ParseFilesystemRouteParams } from "./filesystem-router.js";

export type FilesystemRouteHandler<
  Path extends string = string,
  Query = Record<string, string | string[]>,
  Body = unknown,
  ResBody = unknown,
> = FileRouteHandler<ParseFilesystemRouteParams<Path>, Query, Body, ResBody>;

export function defineRouteHandler<
  Path extends string = string,
  Query = Record<string, string | string[]>,
  Body = unknown,
  ResBody = unknown,
>(
  handler: FileRouteHandler<ParseFilesystemRouteParams<Path>, Query, Body, ResBody>,
): FileRouteHandler<ParseFilesystemRouteParams<Path>, Query, Body, ResBody> {
  return handler;
}

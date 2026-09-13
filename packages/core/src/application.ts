import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import * as path from "node:path";
import { Request } from "./request.js";
import { Response } from "./response.js";

import * as fs from "node:fs";
import { Router } from "./router.js";
import { resolveConfig, type ForgeConfigInput, type ResolvedForgeConfig } from "./config.js";
import type { RouteContext } from "./context.js";
import { scanRouteFiles } from "./route-scanner.js";
import { loadRouteModules } from "./route-loader.js";
import { registerLoadedRoutes } from "./route-registrar.js";
import {
  executeRouteValidation,
  isRouteDefinition,
  type RouteDefinition,
} from "./route-definition.js";

export interface ApplicationOptions {
  appDir?: string;
  config?: ResolvedForgeConfig | ForgeConfigInput;
  skipFsRouting?: boolean;
}

export type ApplicationState = "created" | "starting" | "running" | "stopping" | "stopped";

export type NextFunction = (err?: unknown) => Promise<void>;

type CleanParamName<S extends string> = S extends `${infer Name}?` ? Name : S;

type ExtractParamKeys<Path extends string> = Path extends `${string}:${infer Rest}`
  ? Rest extends `${infer Param}/${infer Tail}`
    ? CleanParamName<Param> | ExtractParamKeys<`/${Tail}`>
    : CleanParamName<Rest>
  : Path extends `${string}*${infer Wildcard}`
    ? Wildcard extends `${infer Param}/${infer Tail}`
      ? (Param extends "" ? "*" : Param) | ExtractParamKeys<`/${Tail}`>
      : Wildcard extends ""
        ? "*"
        : Wildcard
    : never;

export type ParseRouteParams<Path extends string> = string extends Path
  ? Record<string, string>
  : [ExtractParamKeys<Path>] extends [never]
    ? Record<string, never>
    : { [K in ExtractParamKeys<Path>]: string };

type NoInfer<T> = [T][0];

export type Middleware<
  Params = Record<string, string>,
  Query = Record<string, string | string[]>,
  Body = unknown,
  ResBody = unknown,
> = (
  request: Request<Params, Query, Body>,
  response: Response<ResBody>,
  next: NextFunction,
) => void | Promise<unknown>;

export type ErrorMiddleware<
  Params = Record<string, string>,
  Query = Record<string, string | string[]>,
  Body = unknown,
  ResBody = unknown,
> = (
  error: unknown,
  request: Request<Params, Query, Body>,
  response: Response<ResBody>,
  next: NextFunction,
) => void | Promise<unknown>;

export type AnyMiddleware =
  | Middleware<Record<string, string>, Record<string, string | string[]>, unknown, unknown>
  | ErrorMiddleware<Record<string, string>, Record<string, string | string[]>, unknown, unknown>;

export { type RouteContext };

export type RouteHandler<
  Params = Record<string, string>,
  Query = Record<string, string | string[]>,
  Body = unknown,
  ResBody = unknown,
> =
  Params extends RouteContext<infer P, infer Q, infer B, infer R>
    ? Middleware<P, Q, B, R>
    : Middleware<Params, Query, Body, ResBody>;

export type RequestHandler<
  Params = Record<string, string>,
  Query = Record<string, string | string[]>,
  Body = unknown,
  ResBody = unknown,
> = Middleware<Params, Query, Body, ResBody>;

interface MiddlewareEntry {
  prefix?: string;
  middleware: AnyMiddleware;
  isError: boolean;
  order: number;
}

function matchesPrefix(prefix: string | undefined, pathname: string): boolean {
  if (!prefix || prefix === "/" || prefix === "") {
    return true;
  }

  let normPrefix = prefix;
  if (normPrefix.endsWith("/") && normPrefix.length > 1) {
    normPrefix = normPrefix.slice(0, -1);
  }
  if (!normPrefix.startsWith("/")) {
    normPrefix = `/${normPrefix}`;
  }

  if (!normPrefix.includes(":") && !normPrefix.includes("*")) {
    return pathname === normPrefix || pathname.startsWith(`${normPrefix}/`);
  }

  const prefixSegs = normPrefix.split("/").slice(1);
  const pathSegs = pathname.split("/").slice(1);

  if (pathSegs.length < prefixSegs.length) {
    return false;
  }

  for (let i = 0; i < prefixSegs.length; i++) {
    const pSeg = prefixSegs[i];
    if (pSeg.startsWith("*")) {
      return true;
    }
    if (pSeg.startsWith(":")) {
      continue;
    }
    if (pSeg !== pathSegs[i]) {
      return false;
    }
  }

  return true;
}

function extractPrefixParams(
  prefix: string | undefined,
  pathname: string,
  params: Record<string, string>,
): void {
  if (!prefix || (!prefix.includes(":") && !prefix.includes("*"))) {
    return;
  }

  let normPrefix = prefix;
  if (normPrefix.endsWith("/") && normPrefix.length > 1) {
    normPrefix = normPrefix.slice(0, -1);
  }
  if (!normPrefix.startsWith("/")) {
    normPrefix = `/${normPrefix}`;
  }

  const prefixSegs = normPrefix.split("/").slice(1);
  const pathSegs = pathname.split("/").slice(1);

  for (let i = 0; i < prefixSegs.length; i++) {
    const pSeg = prefixSegs[i];
    if (pSeg.startsWith("*")) {
      const paramName = pSeg.slice(1) || "*";
      if (!(paramName in params)) {
        let rest = pathSegs.slice(i).join("/");
        try {
          rest = decodeURIComponent(rest);
        } catch {
          // preserve un-decoded string if decode fails
        }
        params[paramName] = rest;
      }
      break;
    }
    if (pSeg.startsWith(":")) {
      const paramName = pSeg.slice(1);
      if (!(paramName in params)) {
        let val = pathSegs[i];
        try {
          val = decodeURIComponent(val);
        } catch {
          // preserve un-decoded string if decode fails
        }
        params[paramName] = val;
      }
    }
  }
}

export class Application {
  private readonly configState: ResolvedForgeConfig;
  private readonly server: Server;
  private readonly settings = new Map<string, unknown>();
  private readonly router = new Router();
  private readonly middlewares: MiddlewareEntry[] = [];
  private readonly appDir: string;
  private registrationCounter = 0;
  private state: ApplicationState = "created";
  private startPromise?: Promise<void>;
  private stopPromise?: Promise<void>;
  private fsRoutesLoaded = false;

  constructor(options?: ApplicationOptions | ResolvedForgeConfig | ForgeConfigInput) {
    let rawConfig: ResolvedForgeConfig | ForgeConfigInput | undefined = undefined;
    let rawAppDir: string | undefined = undefined;

    if (options !== null && typeof options === "object") {
      if ("appDir" in options || "config" in options || "skipFsRouting" in options) {
        const opts = options as ApplicationOptions;
        rawAppDir = opts.appDir;
        rawConfig = opts.config;
        if (opts.skipFsRouting) {
          this.fsRoutesLoaded = true;
        }
      } else {
        rawConfig = options as ResolvedForgeConfig | ForgeConfigInput;
      }
    }

    this.appDir = rawAppDir ? path.resolve(rawAppDir) : path.resolve(process.cwd(), "src/app");
    this.configState = resolveConfig(rawConfig);
    this.server = createServer((request: IncomingMessage, response: ServerResponse) => {
      const req = new Request(request);
      const res = new Response(response);

      void this.handleRequest(req, res);
    });
  }

  public get config(): ResolvedForgeConfig {
    return this.configState;
  }

  use(...handlers: Middleware[]): this;
  use(...handlers: (Middleware | Middleware[])[]): this;
  use(...handlers: ErrorMiddleware[]): this;
  use(...handlers: (ErrorMiddleware | ErrorMiddleware[])[]): this;
  use<
    Body = unknown,
    Query = Record<string, string | string[]>,
    ResBody = unknown,
    P extends string = string,
  >(path: P, ...handlers: Middleware<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody>[]): this;
  use<
    Body = unknown,
    Query = Record<string, string | string[]>,
    ResBody = unknown,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      | Middleware<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody>
      | Middleware<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody>[]
    )[]
  ): this;
  use(path: string, ...handlers: ErrorMiddleware[]): this;
  use(path: string, ...handlers: (ErrorMiddleware | ErrorMiddleware[])[]): this;
  use(...args: (string | AnyMiddleware | (AnyMiddleware | AnyMiddleware[])[])[]): this {
    if (args.length === 0) {
      return this;
    }

    let prefix: string | undefined = undefined;
    let mwArgs = args;

    if (typeof args[0] === "string") {
      prefix = args[0];
      mwArgs = args.slice(1);
    }

    const flatMiddlewares = mwArgs.flat(Infinity) as AnyMiddleware[];
    for (const mw of flatMiddlewares) {
      if (typeof mw === "function") {
        this.middlewares.push({
          prefix,
          middleware: mw,
          isError: mw.length === 4,
          order: ++this.registrationCounter,
        });
      }
    }

    return this;
  }

  private addRoute(
    method: string,
    path: string,
    handlers: (RouteHandler | RouteDefinition | (RouteHandler | RouteDefinition[])[])[],
  ): this {
    const flat = handlers.flat(Infinity) as (RouteHandler | RouteDefinition)[];
    if (flat.length === 0) {
      throw new Error("Route requires at least one handler function");
    }

    const rawRoute = flat[flat.length - 1];
    const routeMiddlewares = flat.slice(0, -1) as Middleware[];

    const isDef = isRouteDefinition(rawRoute);
    const targetHandler = isDef ? rawRoute.handler : rawRoute;
    const options = isDef ? rawRoute.options : undefined;

    let finalHandler: RouteHandler;
    if (options?.validate) {
      finalHandler = async (req, res, next) => {
        await executeRouteValidation(options, req);
        return (targetHandler as RouteHandler)(req, res, next);
      };
    } else {
      finalHandler = targetHandler as RouteHandler;
    }

    this.router.add(
      method,
      path,
      finalHandler,
      routeMiddlewares.length > 0 ? routeMiddlewares : undefined,
      ++this.registrationCounter,
    );
    return this;
  }

  async start(): Promise<void> {
    if (this.startPromise && this.state === "starting") {
      return this.startPromise;
    }

    if (this.state !== "created") {
      throw new Error(`Cannot start application from state: ${this.state}`);
    }

    this.startPromise = this.performStart();
    return this.startPromise;
  }

  private async performStart(): Promise<void> {
    this.transitionTo("starting");

    try {
      await this.loadFilesystemRoutes();
      await this.onStart();
      this.transitionTo("running");
    } catch (error) {
      this.fsRoutesLoaded = false;
      this.transitionTo("stopped");
      throw error;
    }
  }

  private async loadFilesystemRoutes(): Promise<void> {
    if (this.fsRoutesLoaded) {
      return;
    }
    this.fsRoutesLoaded = true;

    if (!fs.existsSync(this.appDir)) {
      return;
    }

    const discoveredRoutes = scanRouteFiles({ appDir: this.appDir });
    const loadedModules = await loadRouteModules(discoveredRoutes);
    registerLoadedRoutes(this.router, loadedModules, this);
  }

  listen(port?: number, host?: string, callback?: () => void): Server;
  listen(port?: number, callback?: () => void): Server;
  listen(port?: number, hostOrCallback?: string | (() => void), callback?: () => void): Server {
    if (this.state !== "created") {
      throw new Error(`Cannot listen when application state is "${this.state}"`);
    }

    const targetPort = port ?? this.configState.server.port;
    let targetHost: string | undefined;
    let listener: (() => void) | undefined;

    if (typeof hostOrCallback === "function") {
      listener = hostOrCallback;
      targetHost = undefined;
    } else if (typeof hostOrCallback === "string") {
      targetHost = hostOrCallback;
      listener = callback;
    } else {
      targetHost = port === undefined ? this.configState.server.host : undefined;
      listener = callback;
    }

    this.transitionTo("starting");

    this.server.once("error", () => {
      if (this.state === "starting" || this.state === "running") {
        if (this.state === "running") {
          this.transitionTo("stopping");
        }
        this.transitionTo("stopped");
      }
    });

    const onListening = () => {
      this.transitionTo("running");
      if (listener) {
        listener();
      }
    };

    void (async () => {
      try {
        await this.loadFilesystemRoutes();
        await this.onStart();

        if (targetHost !== undefined) {
          this.server.listen(targetPort, targetHost, onListening);
        } else {
          this.server.listen(targetPort, onListening);
        }
      } catch (err) {
        this.fsRoutesLoaded = false;
        if (this.state === "starting") {
          this.transitionTo("stopped");
        }
        this.server.emit("error", err);
      }
    })();

    return this.server;
  }

  async stop(): Promise<void> {
    if (this.stopPromise && this.state === "stopping") {
      return this.stopPromise;
    }

    if (this.state !== "running") {
      throw new Error(`Cannot stop application from state: ${this.state}`);
    }

    this.stopPromise = this.performStop();
    return this.stopPromise;
  }

  private async performStop(): Promise<void> {
    this.transitionTo("stopping");

    try {
      await this.onStop();
      this.transitionTo("stopped");
    } catch (error) {
      this.transitionTo("stopped");
      throw error;
    }
  }

  protected async onStart(): Promise<void> {}

  protected async onStop(): Promise<void> {}

  get<
    ResBody = unknown,
    Body = unknown,
    Query = Record<string, string | string[]>,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody> | RouteDefinition
    )[]
  ): this;
  get<
    ResBody = unknown,
    Body = unknown,
    Query = Record<string, string | string[]>,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      | RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody>
      | RouteDefinition
      | (RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody> | RouteDefinition)[]
    )[]
  ): this;
  get(path: string, ...handlers: unknown[]): this {
    return this.addRoute("GET", path, handlers as (RouteHandler | RouteDefinition)[]);
  }

  post<
    ResBody = unknown,
    Body = unknown,
    Query = Record<string, string | string[]>,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody> | RouteDefinition
    )[]
  ): this;
  post<
    ResBody = unknown,
    Body = unknown,
    Query = Record<string, string | string[]>,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      | RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody>
      | RouteDefinition
      | (RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody> | RouteDefinition)[]
    )[]
  ): this;
  post(path: string, ...handlers: unknown[]): this {
    return this.addRoute("POST", path, handlers as (RouteHandler | RouteDefinition)[]);
  }

  put<
    ResBody = unknown,
    Body = unknown,
    Query = Record<string, string | string[]>,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody> | RouteDefinition
    )[]
  ): this;
  put<
    ResBody = unknown,
    Body = unknown,
    Query = Record<string, string | string[]>,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      | RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody>
      | RouteDefinition
      | (RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody> | RouteDefinition)[]
    )[]
  ): this;
  put(path: string, ...handlers: unknown[]): this {
    return this.addRoute("PUT", path, handlers as (RouteHandler | RouteDefinition)[]);
  }

  patch<
    ResBody = unknown,
    Body = unknown,
    Query = Record<string, string | string[]>,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody> | RouteDefinition
    )[]
  ): this;
  patch<
    ResBody = unknown,
    Body = unknown,
    Query = Record<string, string | string[]>,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      | RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody>
      | RouteDefinition
      | (RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody> | RouteDefinition)[]
    )[]
  ): this;
  patch(path: string, ...handlers: unknown[]): this {
    return this.addRoute("PATCH", path, handlers as (RouteHandler | RouteDefinition)[]);
  }

  delete<
    ResBody = unknown,
    Body = unknown,
    Query = Record<string, string | string[]>,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody> | RouteDefinition
    )[]
  ): this;
  delete<
    ResBody = unknown,
    Body = unknown,
    Query = Record<string, string | string[]>,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      | RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody>
      | RouteDefinition
      | (RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody> | RouteDefinition)[]
    )[]
  ): this;
  delete(path: string, ...handlers: unknown[]): this {
    return this.addRoute("DELETE", path, handlers as (RouteHandler | RouteDefinition)[]);
  }

  options<
    ResBody = unknown,
    Body = unknown,
    Query = Record<string, string | string[]>,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody> | RouteDefinition
    )[]
  ): this;
  options<
    ResBody = unknown,
    Body = unknown,
    Query = Record<string, string | string[]>,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      | RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody>
      | RouteDefinition
      | (RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody> | RouteDefinition)[]
    )[]
  ): this;
  options(path: string, ...handlers: unknown[]): this {
    return this.addRoute("OPTIONS", path, handlers as (RouteHandler | RouteDefinition)[]);
  }

  head<
    ResBody = unknown,
    Body = unknown,
    Query = Record<string, string | string[]>,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody> | RouteDefinition
    )[]
  ): this;
  head<
    ResBody = unknown,
    Body = unknown,
    Query = Record<string, string | string[]>,
    P extends string = string,
  >(
    path: P,
    ...handlers: (
      | RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody>
      | RouteDefinition
      | (RouteHandler<ParseRouteParams<NoInfer<P>>, Query, Body, ResBody> | RouteDefinition)[]
    )[]
  ): this;
  head(path: string, ...handlers: unknown[]): this {
    return this.addRoute("HEAD", path, handlers as (RouteHandler | RouteDefinition)[]);
  }

  protected async handleRequest(request: Request, response: Response): Promise<void> {
    const method = (request.raw.method ?? "GET").toUpperCase();
    const rawUrl = request.raw.url ?? "/";
    const pathname = new URL(rawUrl, "http://localhost").pathname;

    const match = this.router.find(method, pathname);

    if (match) {
      request.params = match.params;
    }

    interface PipelineItem {
      fn: AnyMiddleware;
      isError: boolean;
      order: number;
    }

    const pipeline: PipelineItem[] = [];

    for (const entry of this.middlewares) {
      if (matchesPrefix(entry.prefix, pathname)) {
        extractPrefixParams(entry.prefix, pathname, request.params);
        pipeline.push({
          fn: entry.middleware,
          isError: entry.isError,
          order: entry.order,
        });
      }
    }

    if (match) {
      const routeOrder = match.order ?? 0;
      if (match.middlewares) {
        for (const mw of match.middlewares) {
          pipeline.push({
            fn: mw,
            isError: mw.length === 4,
            order: routeOrder,
          });
        }
      }
      pipeline.push({
        fn: match.handler,
        isError: match.handler.length === 4,
        order: routeOrder,
      });
    }

    pipeline.sort((a, b) => a.order - b.order);

    let hasError = false;
    let currentError: unknown = undefined;

    const dispatch = async (index: number, err?: unknown): Promise<void> => {
      if (err !== undefined) {
        hasError = true;
        currentError = err;
      }

      if (index >= pipeline.length) {
        if (hasError) {
          this.handleError(currentError, request, response);
          return;
        }
        if (!match) {
          if (this.router.hasPath(pathname)) {
            response.status(405).end();
          } else {
            this.handleNotFound(request, response);
          }
        }
        return;
      }

      const item = pipeline[index];

      if (hasError) {
        if (!item.isError) {
          return dispatch(index + 1);
        }

        let nextCalled = false;
        const next = async (nextErr?: unknown): Promise<void> => {
          if (nextCalled) {
            return;
          }
          nextCalled = true;
          await dispatch(index + 1, nextErr !== undefined ? nextErr : currentError);
        };

        try {
          await (item.fn as ErrorMiddleware)(currentError, request, response, next);
        } catch (error) {
          if (!nextCalled) {
            await dispatch(index + 1, error);
          }
        }
      } else {
        if (item.isError) {
          return dispatch(index + 1);
        }

        let nextCalled = false;
        const next = async (nextErr?: unknown): Promise<void> => {
          if (nextCalled) {
            return;
          }
          nextCalled = true;
          await dispatch(index + 1, nextErr);
        };

        try {
          await (item.fn as Middleware)(request, response, next);
        } catch (error) {
          if (!nextCalled) {
            await dispatch(index + 1, error);
          }
        }
      }
    };

    try {
      await dispatch(0);
    } catch (error) {
      this.handleError(error, request, response);
    }
  }

  protected handleError(error: unknown, _request: Request, response: Response): void {
    if (response.raw.headersSent) {
      return;
    }

    response.status(500);

    const isProduction = process.env.NODE_ENV === "production";
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (isProduction) {
      response.json({ error: "Internal Server Error" });
    } else {
      response.json({
        error: "Internal Server Error",
        message: errorMessage,
      });
    }
  }

  protected handleNotFound(_request: Request, response: Response): void {
    if (response.raw.headersSent) {
      return;
    }

    response.status(404).end();
  }

  protected getSetting<T>(key: string): T | undefined {
    return this.settings.get(key) as T | undefined;
  }

  protected setSetting(key: string, value: unknown): void {
    this.settings.set(key, value);
  }

  protected getServer(): Server {
    return this.server;
  }

  protected getState(): ApplicationState {
    return this.state;
  }

  protected transitionTo(state: ApplicationState): void {
    if (!this.canTransitionTo(state)) {
      throw new Error(`Invalid application state transition: ${this.state} -> ${state}`);
    }

    this.state = state;
  }

  private canTransitionTo(nextState: ApplicationState): boolean {
    const transitions: Record<ApplicationState, ApplicationState[]> = {
      created: ["starting"],
      starting: ["running", "stopping", "stopped"],
      running: ["stopping"],
      stopping: ["stopped"],
      stopped: [],
    };

    return transitions[this.state].includes(nextState);
  }

  close(): Promise<void> {
    if (this.state === "stopped") {
      return Promise.resolve();
    }

    if (this.state === "created") {
      this.transitionTo("starting");
      this.transitionTo("stopped");
      return Promise.resolve();
    }

    if (this.state === "starting") {
      this.transitionTo("stopping");
    } else if (this.state === "running") {
      this.transitionTo("stopping");
    }

    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          this.transitionTo("stopped");
          reject(error);
          return;
        }

        this.transitionTo("stopped");
        resolve();
      });
    });
  }
}

export function createApp(
  options?: ApplicationOptions | ResolvedForgeConfig | ForgeConfigInput,
): Application {
  return new Application(options);
}

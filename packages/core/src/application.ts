import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { Request } from "./request.js";
import { Response } from "./response.js";

import { Router } from "./router.js";

export type ApplicationState = "created" | "starting" | "running" | "stopping" | "stopped";

export type NextFunction = (err?: unknown) => Promise<void>;

export type Middleware = (
  request: Request,
  response: Response,
  next: NextFunction,
) => void | Promise<void>;

export type ErrorMiddleware = (
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction,
) => void | Promise<void>;

export type AnyMiddleware = Middleware | ErrorMiddleware;
export type RouteHandler = Middleware;
export type RequestHandler = Middleware;

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

  if (pathname === normPrefix || pathname.startsWith(`${normPrefix}/`)) {
    return true;
  }

  return false;
}

export class Application {
  private readonly server: Server;
  private readonly settings = new Map<string, unknown>();
  private readonly router = new Router();
  private readonly middlewares: MiddlewareEntry[] = [];
  private registrationCounter = 0;
  private state: ApplicationState = "created";
  private startPromise?: Promise<void>;
  private stopPromise?: Promise<void>;

  constructor() {
    this.server = createServer((request: IncomingMessage, response: ServerResponse) => {
      const req = new Request(request);
      const res = new Response(response);

      void this.handleRequest(req, res);
    });
  }

  use(...handlers: Middleware[]): this;
  use(...handlers: (Middleware | Middleware[])[]): this;
  use(...handlers: ErrorMiddleware[]): this;
  use(...handlers: (ErrorMiddleware | ErrorMiddleware[])[]): this;
  use(path: string, ...handlers: Middleware[]): this;
  use(path: string, ...handlers: (Middleware | Middleware[])[]): this;
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
    handlers: (RouteHandler | RouteHandler[])[],
  ): this {
    const flat = handlers.flat(Infinity) as RouteHandler[];
    if (flat.length === 0) {
      throw new Error("Route requires at least one handler function");
    }

    const routeHandler = flat[flat.length - 1];
    const routeMiddlewares = flat.slice(0, -1) as Middleware[];

    this.router.add(
      method,
      path,
      routeHandler,
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
      await this.onStart();
      this.transitionTo("running");
    } catch (error) {
      this.transitionTo("stopped");
      throw error;
    }
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

  get(path: string, ...handlers: RouteHandler[]): this;
  get(path: string, ...handlers: (RouteHandler | RouteHandler[])[]): this;
  get(path: string, ...handlers: (RouteHandler | RouteHandler[])[]): this {
    return this.addRoute("GET", path, handlers);
  }

  post(path: string, ...handlers: RouteHandler[]): this;
  post(path: string, ...handlers: (RouteHandler | RouteHandler[])[]): this;
  post(path: string, ...handlers: (RouteHandler | RouteHandler[])[]): this {
    return this.addRoute("POST", path, handlers);
  }

  put(path: string, ...handlers: RouteHandler[]): this;
  put(path: string, ...handlers: (RouteHandler | RouteHandler[])[]): this;
  put(path: string, ...handlers: (RouteHandler | RouteHandler[])[]): this {
    return this.addRoute("PUT", path, handlers);
  }

  patch(path: string, ...handlers: RouteHandler[]): this;
  patch(path: string, ...handlers: (RouteHandler | RouteHandler[])[]): this;
  patch(path: string, ...handlers: (RouteHandler | RouteHandler[])[]): this {
    return this.addRoute("PATCH", path, handlers);
  }

  delete(path: string, ...handlers: RouteHandler[]): this;
  delete(path: string, ...handlers: (RouteHandler | RouteHandler[])[]): this;
  delete(path: string, ...handlers: (RouteHandler | RouteHandler[])[]): this {
    return this.addRoute("DELETE", path, handlers);
  }

  options(path: string, ...handlers: RouteHandler[]): this;
  options(path: string, ...handlers: (RouteHandler | RouteHandler[])[]): this;
  options(path: string, ...handlers: (RouteHandler | RouteHandler[])[]): this {
    return this.addRoute("OPTIONS", path, handlers);
  }

  head(path: string, ...handlers: RouteHandler[]): this;
  head(path: string, ...handlers: (RouteHandler | RouteHandler[])[]): this;
  head(path: string, ...handlers: (RouteHandler | RouteHandler[])[]): this {
    return this.addRoute("HEAD", path, handlers);
  }

  private async handleRequest(request: Request, response: Response): Promise<void> {
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

  listen(port: number): Server {
    if (this.state !== "created") {
      throw new Error(`Cannot listen when application state is "${this.state}"`);
    }

    this.transitionTo("starting");

    this.server.once("error", () => {
      this.transitionTo("stopped");
    });

    this.server.listen(port, () => {
      this.transitionTo("running");
    });

    return this.server;
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

export function createApp(): Application {
  return new Application();
}

import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { Request } from "./request.js";
import { Response } from "./response.js";

import { Router } from "./router.js";

export type ApplicationState = "created" | "starting" | "running" | "stopping" | "stopped";

export type RouteHandler = (request: Request, response: Response) => void | Promise<void>;

export class Application {
  private readonly server: Server;
  private readonly settings = new Map<string, unknown>();
  private readonly router = new Router();
  private state: ApplicationState = "created";

  constructor() {
    this.server = createServer((request: IncomingMessage, response: ServerResponse) => {
      const req = new Request(request);
      const res = new Response(response);

      void this.handleRequest(req, res);
    });
  }

  private addRoute(method: string, path: string, handler: RouteHandler): this {
    this.router.add(method, path, handler);
    return this;
  }

  get(path: string, handler: RouteHandler): this {
    return this.addRoute("GET", path, handler);
  }

  post(path: string, handler: RouteHandler): this {
    return this.addRoute("POST", path, handler);
  }

  put(path: string, handler: RouteHandler): this {
    return this.addRoute("PUT", path, handler);
  }

  patch(path: string, handler: RouteHandler): this {
    return this.addRoute("PATCH", path, handler);
  }

  delete(path: string, handler: RouteHandler): this {
    return this.addRoute("DELETE", path, handler);
  }

  options(path: string, handler: RouteHandler): this {
    return this.addRoute("OPTIONS", path, handler);
  }

  head(path: string, handler: RouteHandler): this {
    return this.addRoute("HEAD", path, handler);
  }

  private async handleRequest(request: Request, response: Response): Promise<void> {
    const method = (request.raw.method ?? "GET").toUpperCase();
    const rawUrl = request.raw.url ?? "/";
    const pathname = new URL(rawUrl, "http://localhost").pathname;

    const match = this.router.find(method, pathname);

    if (match) {
      request.params = match.params;
      try {
        await match.handler(request, response);
      } catch (error) {
        this.handleError(error, request, response);
      }
      return;
    }

    this.handleNotFound(request, response);
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

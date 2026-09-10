import { createServer, type Server } from "node:http";

export type ApplicationState = "created" | "starting" | "running" | "stopping" | "stopped";

export class Application {
  private readonly server: Server;

  private readonly settings = new Map<string, unknown>();
  private state: ApplicationState = "created";

  constructor() {
    this.server = createServer();
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

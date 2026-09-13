import { createServer, Server } from "node:http";
import { describe, expect, it } from "vitest";
import { Application, createApp } from "../../packages/core/src/index.js";
import { ApplicationState } from "../../packages/core/src/application.js";

class TestApplication extends Application {
  public startCount = 0;
  public stopCount = 0;

  protected override async onStart(): Promise<void> {
    this.startCount++;
  }

  protected override async onStop(): Promise<void> {
    this.stopCount++;
  }

  public readSetting<T>(key: string): T | undefined {
    return this.getSetting<T>(key);
  }

  public writeSetting(key: string, value: unknown): void {
    this.setSetting(key, value);
  }

  public readServer(): Server {
    return this.getServer();
  }

  public readState(): ApplicationState {
    return this.getState();
  }

  public transitionState(state: ApplicationState): void {
    this.transitionTo(state);
  }
}

describe("createApp", () => {
  it("creates and returns an application instance", () => {
    const app = createApp();
    expect(app).toBeDefined();
    expect(app).toBeInstanceOf(Application);
  });

  it("should create independent application instances", () => {
    const first = createApp();
    const second = createApp();

    expect(first).not.toBe(second);
  });

  it("should store and retrieve internal settings", () => {
    const app = new TestApplication();

    app.writeSetting("port", 3000);

    expect(app.readSetting<number>("port")).toBe(3000);
  });

  it("should start in the created state", () => {
    const app = new TestApplication();

    expect(app.readState()).toBe("created");
  });

  it("should allow lifecycle state transitions internally", () => {
    const app = new TestApplication();

    app.transitionState("starting");
    expect(app.readState()).toBe("starting");

    app.transitionState("running");
    expect(app.readState()).toBe("running");

    app.transitionState("stopping");
    expect(app.readState()).toBe("stopping");

    app.transitionState("stopped");
    expect(app.readState()).toBe("stopped");
  });

  it("should reject invalid lifecycle transitions", () => {
    const app = new TestApplication();

    expect(() => app.transitionState("running")).toThrow(
      "Invalid application state transition: created -> running",
    );
  });

  it("should not allow transitions after stopping", () => {
    const app = new TestApplication();

    app.transitionState("starting");
    app.transitionState("running");
    app.transitionState("stopping");
    app.transitionState("stopped");

    expect(() => app.transitionState("starting")).toThrow(
      "Invalid application state transition: stopped -> starting",
    );
  });

  it("should create an independent HTTP server for each application", () => {
    const first = new TestApplication();
    const second = new TestApplication();

    expect(first.readServer()).toBeInstanceOf(Server);
    expect(first.readServer()).not.toBe(second.readServer());
  });

  it("should expose a listen method", () => {
    const app = createApp();

    expect(app.listen).toBeTypeOf("function");
  });

  it("should start listening on the provided port", async () => {
    const app = createApp();
    const server = app.listen(0);

    await new Promise<void>((resolve, reject) => {
      server.once("listening", () => resolve());
      server.once("error", reject);
    });

    expect(server.listening).toBe(true);

    server.close();
  });

  it("should transition to stopped when server startup fails", async () => {
    const blocker = createServer();

    await new Promise<void>((resolve) => {
      blocker.listen(0, () => resolve());
    });

    const address = blocker.address();

    if (address === null || typeof address === "string") {
      blocker.close();
      throw new Error("Failed to determine blocker port");
    }

    const app = new TestApplication();
    const server = app.listen(address.port);

    await new Promise<void>((resolve) => {
      server.once("error", () => resolve());
    });

    expect(app.readState()).toBe("stopped");

    blocker.close();
  });

  it("should gracefully close a running server", async () => {
    const app = new TestApplication();
    const server = app.listen(0);

    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    expect(app.readState()).toBe("running");

    await app.close();

    expect(app.readState()).toBe("stopped");
    expect(server.listening).toBe(false);
  });

  it("should allow closing an application that has not started", async () => {
    const app = new TestApplication();

    await expect(app.close()).resolves.toBeUndefined();

    expect(app.readState()).toBe("stopped");
  });

  it("should gracefully close a running server", async () => {
    const app = new TestApplication();
    const server = app.listen(0);

    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    expect(app.readState()).toBe("running");

    await app.close();

    expect(app.readState()).toBe("stopped");
    expect(server.listening).toBe(false);
  });

  it("should close an application that has not started", async () => {
    const app = new TestApplication();

    await expect(app.close()).resolves.toBeUndefined();

    expect(app.readState()).toBe("stopped");
  });

  it("should allow close to be called more than once", async () => {
    const app = new TestApplication();

    await app.close();
    await expect(app.close()).resolves.toBeUndefined();

    expect(app.readState()).toBe("stopped");
  });

  it("should reject listening more than once", async () => {
    const app = new TestApplication();
    const server = app.listen(0);

    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    expect(() => app.listen(0)).toThrow('Cannot listen when application state is "running"');

    await app.close();
  });

  describe("start and stop lifecycle", () => {
    it("should transition from created -> start() -> running", async () => {
      const app = new TestApplication();
      expect(app.readState()).toBe("created");

      await app.start();

      expect(app.readState()).toBe("running");
    });

    it("should transition from running -> stop() -> stopped", async () => {
      const app = new TestApplication();
      await app.start();
      expect(app.readState()).toBe("running");

      await app.stop();

      expect(app.readState()).toBe("stopped");
    });

    it("should transition to stopped on start failure", async () => {
      class FailingStartApp extends TestApplication {
        protected override async onStart(): Promise<void> {
          throw new Error("Start failed");
        }
      }

      const app = new FailingStartApp();
      await expect(app.start()).rejects.toThrow("Start failed");

      expect(app.readState()).toBe("stopped");
    });

    it("should transition to stopped on stop failure", async () => {
      class FailingStopApp extends TestApplication {
        protected override async onStop(): Promise<void> {
          throw new Error("Stop failed");
        }
      }

      const app = new FailingStopApp();
      await app.start();
      expect(app.readState()).toBe("running");

      await expect(app.stop()).rejects.toThrow("Stop failed");

      expect(app.readState()).toBe("stopped");
    });

    it("should call onStart only once when start is called concurrently", async () => {
      let startCalls = 0;
      class CountingApp extends TestApplication {
        protected override async onStart(): Promise<void> {
          startCalls++;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      const app = new CountingApp();
      await Promise.all([app.start(), app.start()]);

      expect(startCalls).toBe(1);
      expect(app.readState()).toBe("running");
    });

    it("should reject start when already running and stop when already stopped", async () => {
      const app = new TestApplication();

      await app.start();
      await expect(app.start()).rejects.toThrow();
      await app.stop();
      await expect(app.stop()).rejects.toThrow();
    });

    it("should only execute onStart once for concurrent start calls", async () => {
      const app = new TestApplication();

      await Promise.all([app.start(), app.start()]);

      expect(app.startCount).toBe(1);
      expect(app.readState()).toBe("running");
    });

    it("should only execute onStop once for concurrent stop calls", async () => {
      const app = new TestApplication();

      await app.start();
      await Promise.all([app.stop(), app.stop()]);

      expect(app.stopCount).toBe(1);
      expect(app.readState()).toBe("stopped");
    });
  });
});

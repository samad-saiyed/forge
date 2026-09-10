import { createServer, Server } from "node:http";
import { describe, expect, it } from "vitest";
import { Application, createApp } from "../../packages/core/src/index.js";
import { ApplicationState } from "../../packages/core/src/application.js";

class TestApplication extends Application {
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
});

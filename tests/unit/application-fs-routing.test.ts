import { describe, test, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import {
  createApp,
  Request,
  Response,
  Application,
  type ApplicationOptions,
} from "../../packages/core/src/index.js";
import type { ApplicationState } from "../../packages/core/src/application.js";

class TestApplication extends Application {
  public async processRequest(req: Request, res: Response): Promise<void> {
    return this.handleRequest(req, res);
  }

  public get readState(): ApplicationState {
    return this.getState();
  }
}

function createTestApp(options?: ApplicationOptions): TestApplication {
  return new TestApplication(options);
}

function makeMockReqRes(method: string, url: string) {
  const rawReq = {
    method,
    url,
    headers: {},
  } as unknown as IncomingMessage;

  let statusCode = 200;
  let responseData: unknown = null;

  const rawRes = {
    headersSent: false,
    statusCode: 200,
    setHeader() {},
    getHeader() {},
    removeHeader() {},
    writeHead(code: number) {
      statusCode = code;
    },
    end(chunk?: Buffer | string) {
      if (chunk) {
        try {
          responseData = JSON.parse(chunk.toString());
        } catch {
          responseData = chunk.toString();
        }
      }
    },
  } as unknown as ServerResponse;

  const req = new Request(rawReq);
  const res = new Response(rawRes);

  return {
    req,
    res,
    getData: () => responseData,
    getStatus: () => res.raw.statusCode || statusCode,
  };
}

describe("Application Filesystem Routing Integration", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-app-fs-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("discovers and executes basic filesystem GET route", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    await fs.writeFile(
      path.join(usersDir, "route.ts"),
      `export const GET = (req, res) => { res.status(200).json({ ok: true }); };`,
      "utf-8",
    );

    const app = createTestApp({ appDir: tmpDir });
    await app.start();

    const { req, res, getData, getStatus } = makeMockReqRes("GET", "/users");
    await app.processRequest(req, res);

    expect(getStatus()).toBe(200);
    expect(getData()).toEqual({ ok: true });
  });

  test("handles dynamic parameter filesystem route", async () => {
    const userDir = path.join(tmpDir, "users", "[id]");
    await fs.mkdir(userDir, { recursive: true });
    await fs.writeFile(
      path.join(userDir, "route.ts"),
      `export const GET = (req, res) => { res.status(200).json({ id: req.params.id }); };`,
      "utf-8",
    );

    const app = createTestApp({ appDir: tmpDir });
    await app.start();

    const { req, res, getData } = makeMockReqRes("GET", "/users/123");
    await app.processRequest(req, res);
    expect(getData()).toEqual({ id: "123" });
  });

  test("handles wildcard filesystem route", async () => {
    const filesDir = path.join(tmpDir, "files", "[...path]");
    await fs.mkdir(filesDir, { recursive: true });
    await fs.writeFile(
      path.join(filesDir, "route.ts"),
      `export const GET = (req, res) => { res.status(200).json({ path: req.params.path }); };`,
      "utf-8",
    );

    const app = createTestApp({ appDir: tmpDir });
    await app.start();

    const { req, res, getData } = makeMockReqRes("GET", "/files/a/b/c");
    await app.processRequest(req, res);
    expect(getData()).toEqual({ path: "a/b/c" });
  });

  test("registers multiple HTTP methods from single route.ts file", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    await fs.writeFile(
      path.join(usersDir, "route.ts"),
      `
        export const GET = (req, res) => { res.status(200).json({ method: "GET" }); };
        export const POST = (req, res) => { res.status(201).json({ method: "POST" }); };
      `,
      "utf-8",
    );

    const app = createTestApp({ appDir: tmpDir });
    await app.start();

    const getCall = makeMockReqRes("GET", "/users");
    await app.processRequest(getCall.req, getCall.res);
    expect(getCall.getData()).toEqual({ method: "GET" });

    const postCall = makeMockReqRes("POST", "/users");
    await app.processRequest(postCall.req, postCall.res);
    expect(postCall.getData()).toEqual({ method: "POST" });
  });

  test("supports programmatic and filesystem routes simultaneously", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    await fs.writeFile(
      path.join(usersDir, "route.ts"),
      `export const GET = (req, res) => { res.status(200).json({ source: "fs" }); };`,
      "utf-8",
    );

    const app = createTestApp({ appDir: tmpDir });
    app.get("/health", (_req, res) => {
      res.status(200).json({ status: "healthy" });
    });

    await app.start();

    const healthCall = makeMockReqRes("GET", "/health");
    await app.processRequest(healthCall.req, healthCall.res);
    expect(healthCall.getData()).toEqual({ status: "healthy" });

    const fsCall = makeMockReqRes("GET", "/users");
    await app.processRequest(fsCall.req, fsCall.res);
    expect(fsCall.getData()).toEqual({ source: "fs" });
  });

  test("throws useful error on duplicate route registration", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    await fs.writeFile(path.join(usersDir, "route.ts"), `export const GET = () => {};`, "utf-8");

    const app = createTestApp({ appDir: tmpDir });
    app.get("/users", () => {});

    await expect(app.start()).rejects.toThrow(/Duplicate route registration/);
  });

  test("handles startup failure cleanly and transitions to stopped", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    await fs.writeFile(
      path.join(usersDir, "route.ts"),
      `export const GET = "invalid non-function handler";`,
      "utf-8",
    );

    const app = createTestApp({ appDir: tmpDir });
    await expect(app.start()).rejects.toThrow(/Invalid route handler/);
    expect(app.readState).toBe("stopped");
  });

  test("works correctly when app.listen() is called", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    await fs.writeFile(
      path.join(usersDir, "route.ts"),
      `export const GET = (req, res) => { res.status(200).json({ listen: true }); };`,
      "utf-8",
    );

    const app = createApp({ appDir: tmpDir });
    const server = app.listen(0);

    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      await app.close();
      throw new Error("Server address unavailable");
    }

    const resData = await new Promise<unknown>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/users",
          method: "GET",
        },
        (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              reject(err);
            }
          });
        },
      );
      req.on("error", reject);
      req.end();
    });

    expect(resData).toEqual({ listen: true });

    await app.close();
  });
});

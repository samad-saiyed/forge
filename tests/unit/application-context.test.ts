import * as fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ApplicationState } from "../../packages/core/src/application.js";
import {
  Application,
  createApplicationContext,
  resolveConfig,
  Request,
  Response,
  type ApplicationOptions,
} from "../../packages/core/src/index.js";

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

describe("Application Context Integration", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-app-context-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("supplies exact Application instance in RouteContext ({ app, request, response })", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    await fs.writeFile(
      path.join(usersDir, "route.ts"),
      `
        export const captured = { app: null, req: null, res: null };
        export const GET = async ({ app, request, response }) => {
          captured.app = app;
          captured.req = request;
          captured.res = response;
          response.status(200).json({ ok: true });
        };
      `,
      "utf-8",
    );

    const app = createTestApp({ appDir: tmpDir });
    await app.start();

    const { req, res, getData, getStatus } = makeMockReqRes("GET", "/users");
    await app.processRequest(req, res);

    expect(getStatus()).toBe(200);
    expect(getData()).toEqual({ ok: true });

    const routeModule = await import(pathToFileURL(path.join(usersDir, "route.ts")).href);
    expect(routeModule.captured.app).toBe(app);
    expect(routeModule.captured.req).toBe(req);
    expect(routeModule.captured.res).toBe(res);
  });

  test("isolates RouteContext across concurrent requests", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    await fs.writeFile(
      path.join(usersDir, "route.ts"),
      `
        export const GET = async ({ app, request, response }) => {
          response.status(200).json({ path: request.url });
        };
      `,
      "utf-8",
    );

    const app = createTestApp({ appDir: tmpDir });
    await app.start();

    const reqRes1 = makeMockReqRes("GET", "/users");
    const reqRes2 = makeMockReqRes("GET", "/users");

    await Promise.all([
      app.processRequest(reqRes1.req, reqRes1.res),
      app.processRequest(reqRes2.req, reqRes2.res),
    ]);

    expect(reqRes1.getData()).toEqual({ path: "/users" });
    expect(reqRes2.getData()).toEqual({ path: "/users" });
  });

  test("preserves 2-argument (req, res) programmatic handlers", async () => {
    const app = createTestApp({ appDir: tmpDir });

    let capturedReq: unknown = null;
    let capturedRes: unknown = null;

    app.get("/health", (req, res) => {
      capturedReq = req;
      capturedRes = res;
      res.status(200).json({ status: "healthy" });
    });

    await app.start();

    const { req, res, getData, getStatus } = makeMockReqRes("GET", "/health");
    await app.processRequest(req, res);

    expect(getStatus()).toBe(200);
    expect(getData()).toEqual({ status: "healthy" });
    expect(capturedReq).toBe(req);
    expect(capturedRes).toBe(res);
  });

  test("supports parameterized route in RouteContext ({ app, request, response })", async () => {
    const userDir = path.join(tmpDir, "users", "[id]");
    await fs.mkdir(userDir, { recursive: true });
    await fs.writeFile(
      path.join(userDir, "route.ts"),
      `
        export const GET = async ({ request, response }) => {
          response.status(200).json({ id: request.params.id });
        };
      `,
      "utf-8",
    );

    const app = createTestApp({ appDir: tmpDir });
    await app.start();

    const { req, res, getData, getStatus } = makeMockReqRes("GET", "/users/42");
    await app.processRequest(req, res);

    expect(getStatus()).toBe(200);
    expect(getData()).toEqual({ id: "42" });
  });

  test("ApplicationContext accepts resolved Forge configuration and shares identity with app", () => {
    const rawInput = {
      server: {
        host: "127.0.0.1",
        port: 4567,
      },
    };

    const context = createApplicationContext({ config: rawInput });

    expect(context.config.server.port).toBe(4567);
    expect(context.config.server.host).toBe("127.0.0.1");
    expect(context.app.config.server.port).toBe(4567);
    expect(context.app.config.server.host).toBe("127.0.0.1");

    // Single configuration identity boundary check
    expect(context.app.config).toBe(context.config);
  });

  test("ApplicationContext preserves defaults when created without configuration", () => {
    const defaultContext = createApplicationContext();

    expect(defaultContext.config).toBeDefined();
    expect(defaultContext.config.server.port).toBe(3000);
    expect(defaultContext.config.server.host).toBe("127.0.0.1");
    expect(defaultContext.app.config.server.port).toBe(3000);
    expect(defaultContext.app.config).toBe(defaultContext.config);
  });

  test("accepts already resolved configuration instance without duplicate resolution", () => {
    const resolved = resolveConfig({ server: { port: 8080 } });
    const context = createApplicationContext({ config: resolved });

    expect(context.config).toBe(resolved);
    expect(context.app.config).toBe(resolved);
  });
});

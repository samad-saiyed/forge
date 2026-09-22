import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import { createApp, Application, Request, Response } from "../../packages/core/src/index.js";
import type { ApplicationState } from "../../packages/core/src/application.js";

class TestApplication extends Application {
  public async processRequest(req: Request, res: Response): Promise<void> {
    return this.handleRequest(req, res);
  }

  public get readState(): ApplicationState {
    return this.getState();
  }
}

function createTestApp(appDir: string): TestApplication {
  return new TestApplication({ appDir });
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

describe("Filesystem Route Execution & Context Wiring (Action 51)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kyuu-exec-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("injects request-scoped RouteContext ({ app, request, response }) into filesystem handler", async () => {
    const routeDir = path.join(tmpDir, "context-test");
    await fs.mkdir(routeDir, { recursive: true });
    await fs.writeFile(
      path.join(routeDir, "route.ts"),
      `
      export const GET = ({ app, request, response }) => {
        response.status(200).json({
          hasApp: Boolean(app),
          hasRequest: Boolean(request),
          hasResponse: Boolean(response),
          method: request.raw.method,
        });
      };
      `,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    await app.start();

    const { req, res, getData, getStatus } = makeMockReqRes("GET", "/context-test");
    await app.processRequest(req, res);

    expect(getStatus()).toBe(200);
    expect(getData()).toEqual({
      hasApp: true,
      hasRequest: true,
      hasResponse: true,
      method: "GET",
    });
  });

  it("verifies context.app is the exact Application instance that owns the route", async () => {
    const routeDir = path.join(tmpDir, "app-identity");
    await fs.mkdir(routeDir, { recursive: true });
    await fs.writeFile(
      path.join(routeDir, "route.ts"),
      `
      export const GET = ({ app, response }) => {
        response.status(200).json({
          configPort: app.config.server.port,
        });
      };
      `,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    await app.start();

    const { req, res, getData } = makeMockReqRes("GET", "/app-identity");
    await app.processRequest(req, res);

    expect(getData()).toEqual({
      configPort: app.config.server.port,
    });
  });

  it("populates request.params for dynamic single parameter routes", async () => {
    const userDir = path.join(tmpDir, "users", "[id]");
    await fs.mkdir(userDir, { recursive: true });
    await fs.writeFile(
      path.join(userDir, "route.ts"),
      `
      export const GET = ({ request, response }) => {
        response.status(200).json({ userId: request.params.id });
      };
      `,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    await app.start();

    const { req, res, getData } = makeMockReqRes("GET", "/users/usr_999");
    await app.processRequest(req, res);

    expect(getData()).toEqual({ userId: "usr_999" });
  });

  it("populates request.params for multiple dynamic parameters", async () => {
    const postsDir = path.join(tmpDir, "users", "[userId]", "posts", "[postId]");
    await fs.mkdir(postsDir, { recursive: true });
    await fs.writeFile(
      path.join(postsDir, "route.ts"),
      `
      export const GET = ({ request, response }) => {
        response.status(200).json({
          userId: request.params.userId,
          postId: request.params.postId,
        });
      };
      `,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    await app.start();

    const { req, res, getData } = makeMockReqRes("GET", "/users/u12/posts/p34");
    await app.processRequest(req, res);

    expect(getData()).toEqual({
      userId: "u12",
      postId: "p34",
    });
  });

  it("populates request.params for wildcard routes", async () => {
    const filesDir = path.join(tmpDir, "files", "[...path]");
    await fs.mkdir(filesDir, { recursive: true });
    await fs.writeFile(
      path.join(filesDir, "route.ts"),
      `
      export const GET = ({ request, response }) => {
        response.status(200).json({ filePath: request.params.path });
      };
      `,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    await app.start();

    const { req, res, getData } = makeMockReqRes("GET", "/files/images/2026/logo.png");
    await app.processRequest(req, res);

    expect(getData()).toEqual({ filePath: "images/2026/logo.png" });
  });

  it("routes multiple HTTP methods in the same route file independently", async () => {
    const apiDir = path.join(tmpDir, "items");
    await fs.mkdir(apiDir, { recursive: true });
    await fs.writeFile(
      path.join(apiDir, "route.ts"),
      `
      export const GET = ({ response }) => { response.status(200).json({ action: "read" }); };
      export const POST = ({ response }) => { response.status(201).json({ action: "create" }); };
      export const DELETE = ({ response }) => { response.status(200).json({ action: "delete" }); };
      `,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    await app.start();

    const getCall = makeMockReqRes("GET", "/items");
    await app.processRequest(getCall.req, getCall.res);
    expect(getCall.getStatus()).toBe(200);
    expect(getCall.getData()).toEqual({ action: "read" });

    const postCall = makeMockReqRes("POST", "/items");
    await app.processRequest(postCall.req, postCall.res);
    expect(postCall.getStatus()).toBe(201);
    expect(postCall.getData()).toEqual({ action: "create" });

    const deleteCall = makeMockReqRes("DELETE", "/items");
    await app.processRequest(deleteCall.req, deleteCall.res);
    expect(deleteCall.getStatus()).toBe(200);
    expect(deleteCall.getData()).toEqual({ action: "delete" });
  });

  it("uses explicit filesystem HEAD handler over GET handler for HEAD requests", async () => {
    const headDir = path.join(tmpDir, "head-test");
    await fs.mkdir(headDir, { recursive: true });
    await fs.writeFile(
      path.join(headDir, "route.ts"),
      `
      export const GET = ({ response }) => {
        response.status(200).setHeader("X-Source", "GET").end();
      };
      export const HEAD = ({ response }) => {
        response.status(200).setHeader("X-Source", "HEAD").end();
      };
      `,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    await app.start();

    const { req, res } = makeMockReqRes("HEAD", "/head-test");
    let headerVal = "";
    res.raw.setHeader = ((key: string, val: string) => {
      if (key.toLowerCase() === "x-source") {
        headerVal = val;
      }
    }) as unknown as typeof res.raw.setHeader;

    await app.processRequest(req, res);

    expect(headerVal).toBe("HEAD");
  });

  it("propagates thrown errors in filesystem handlers to application error handler", async () => {
    const errDir = path.join(tmpDir, "error-test");
    await fs.mkdir(errDir, { recursive: true });
    await fs.writeFile(
      path.join(errDir, "route.ts"),
      `
      export const GET = () => {
        throw new Error("Unhandled crash inside filesystem route");
      };
      `,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    await app.start();

    const { req, res, getStatus, getData } = makeMockReqRes("GET", "/error-test");
    await app.processRequest(req, res);

    expect(getStatus()).toBe(500);
    const errData = getData() as { message?: string };
    expect(errData.message).toBe("Unhandled crash inside filesystem route");
  });

  it("guarantees concurrent request context isolation", async () => {
    const userDir = path.join(tmpDir, "concurrent", "[id]");
    await fs.mkdir(userDir, { recursive: true });
    await fs.writeFile(
      path.join(userDir, "route.ts"),
      `
      export const GET = async ({ request, response }) => {
        const id = request.params.id;
        // simulate async work
        await new Promise((r) => setTimeout(r, Math.random() * 20));
        response.status(200).json({ id });
      };
      `,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    await app.start();

    const ids = ["user_1", "user_2", "user_3", "user_4", "user_5"];

    const results = await Promise.all(
      ids.map(async (id) => {
        const { req, res, getData } = makeMockReqRes("GET", `/concurrent/${id}`);
        await app.processRequest(req, res);
        return { requestedId: id, responseData: getData() };
      }),
    );

    for (const item of results) {
      expect(item.responseData).toEqual({ id: item.requestedId });
    }
  });

  it("verifies HTTP server request resolution for dynamic filesystem route", async () => {
    const userDir = path.join(tmpDir, "api", "users", "[id]");
    await fs.mkdir(userDir, { recursive: true });
    await fs.writeFile(
      path.join(userDir, "route.ts"),
      `
      export const GET = ({ request, response }) => {
        response.status(200).json({
          ok: true,
          userId: request.params.id,
        });
      };
      `,
      "utf-8",
    );

    const app = createApp({ appDir: tmpDir });
    const server = app.listen(0);

    await new Promise<void>((resolve) => server.once("listening", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    const resData = await new Promise<unknown>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path: "/api/users/user_abc789",
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

    expect(resData).toEqual({
      ok: true,
      userId: "user_abc789",
    });

    await app.close();
  });
});

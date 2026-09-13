import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Application, Request, Response } from "../../packages/core/src/index.js";
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

describe("Filesystem Routing Precedence & Conflict Resolution", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "forge-precedence-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("prioritizes static filesystem route over dynamic parameter filesystem route", async () => {
    const profileDir = path.join(tmpDir, "users", "profile");
    const idDir = path.join(tmpDir, "users", "[id]");
    await fs.mkdir(profileDir, { recursive: true });
    await fs.mkdir(idDir, { recursive: true });

    await fs.writeFile(
      path.join(profileDir, "route.ts"),
      `export const GET = ({ response }) => { response.status(200).json({ type: "static-profile" }); };`,
      "utf-8",
    );
    await fs.writeFile(
      path.join(idDir, "route.ts"),
      `export const GET = ({ response }) => { response.status(200).json({ type: "dynamic-param" }); };`,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    await app.start();

    const profileCall = makeMockReqRes("GET", "/users/profile");
    await app.processRequest(profileCall.req, profileCall.res);
    expect(profileCall.getData()).toEqual({ type: "static-profile" });

    const idCall = makeMockReqRes("GET", "/users/123");
    await app.processRequest(idCall.req, idCall.res);
    expect(idCall.getData()).toEqual({ type: "dynamic-param" });
  });

  it("prioritizes dynamic parameter filesystem route over wildcard filesystem route", async () => {
    const idDir = path.join(tmpDir, "users", "[id]");
    const wildcardDir = path.join(tmpDir, "users", "[...path]");
    await fs.mkdir(idDir, { recursive: true });
    await fs.mkdir(wildcardDir, { recursive: true });

    await fs.writeFile(
      path.join(idDir, "route.ts"),
      `export const GET = ({ response }) => { response.status(200).json({ type: "dynamic-param" }); };`,
      "utf-8",
    );
    await fs.writeFile(
      path.join(wildcardDir, "route.ts"),
      `export const GET = ({ response }) => { response.status(200).json({ type: "wildcard" }); };`,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    await app.start();

    const idCall = makeMockReqRes("GET", "/users/123");
    await app.processRequest(idCall.req, idCall.res);
    expect(idCall.getData()).toEqual({ type: "dynamic-param" });

    const wildcardCall = makeMockReqRes("GET", "/users/a/b/c");
    await app.processRequest(wildcardCall.req, wildcardCall.res);
    expect(wildcardCall.getData()).toEqual({ type: "wildcard" });
  });

  it("allows programmatic routes to override static filesystem routes for the same method and path", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    await fs.writeFile(
      path.join(usersDir, "route.ts"),
      `export const GET = ({ response }) => { response.status(200).json({ type: "filesystem" }); };`,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    app.get("/users", (_req, res) => {
      res.status(200).json({ type: "programmatic" });
    });

    await app.start();

    const call = makeMockReqRes("GET", "/users");
    await app.processRequest(call.req, call.res);
    expect(call.getData()).toEqual({ type: "programmatic" });
  });

  it("allows programmatic routes to override dynamic filesystem routes for the same method and pattern", async () => {
    const idDir = path.join(tmpDir, "users", "[id]");
    await fs.mkdir(idDir, { recursive: true });
    await fs.writeFile(
      path.join(idDir, "route.ts"),
      `export const GET = ({ response }) => { response.status(200).json({ type: "filesystem-dynamic" }); };`,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    app.get("/users/:id", (_req, res) => {
      res.status(200).json({ type: "programmatic-dynamic" });
    });

    await app.start();

    const call = makeMockReqRes("GET", "/users/123");
    await app.processRequest(call.req, call.res);
    expect(call.getData()).toEqual({ type: "programmatic-dynamic" });
  });

  it("rejects ambiguous filesystem parameter definitions (e.g. users/[id] and users/[userId])", async () => {
    const idDir = path.join(tmpDir, "users", "[id]");
    const userIdDir = path.join(tmpDir, "users", "[userId]");
    await fs.mkdir(idDir, { recursive: true });
    await fs.mkdir(userIdDir, { recursive: true });

    await fs.writeFile(path.join(idDir, "route.ts"), `export const GET = () => {};`, "utf-8");
    await fs.writeFile(path.join(userIdDir, "route.ts"), `export const GET = () => {};`, "utf-8");

    const app = createTestApp(tmpDir);
    await expect(app.start()).rejects.toThrow(/Ambiguous filesystem route collision/);
  });

  it("rejects ambiguous filesystem wildcard definitions (e.g. files/[...path] and files/[...rest])", async () => {
    const pathDir = path.join(tmpDir, "files", "[...path]");
    const restDir = path.join(tmpDir, "files", "[...rest]");
    await fs.mkdir(pathDir, { recursive: true });
    await fs.mkdir(restDir, { recursive: true });

    await fs.writeFile(path.join(pathDir, "route.ts"), `export const GET = () => {};`, "utf-8");
    await fs.writeFile(path.join(restDir, "route.ts"), `export const GET = () => {};`, "utf-8");

    const app = createTestApp(tmpDir);
    await expect(app.start()).rejects.toThrow(/Ambiguous filesystem route collision/);
  });

  it("isolates conflicts per HTTP method (programmatic POST + filesystem GET)", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    await fs.writeFile(
      path.join(usersDir, "route.ts"),
      `
      export const GET = ({ response }) => { response.status(200).json({ source: "fs-get" }); };
      export const POST = ({ response }) => { response.status(200).json({ source: "fs-post" }); };
      `,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    app.post("/users", (_req, res) => {
      res.status(200).json({ source: "programmatic-post" });
    });

    await app.start();

    const getCall = makeMockReqRes("GET", "/users");
    await app.processRequest(getCall.req, getCall.res);
    expect(getCall.getData()).toEqual({ source: "fs-get" });

    const postCall = makeMockReqRes("POST", "/users");
    await app.processRequest(postCall.req, postCall.res);
    expect(postCall.getData()).toEqual({ source: "programmatic-post" });
  });

  it("preserves explicit filesystem HEAD handler precedence over GET fallback", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    await fs.writeFile(
      path.join(usersDir, "route.ts"),
      `
      export const GET = ({ response }) => { response.status(200).setHeader("X-Test", "GET").end(); };
      export const HEAD = ({ response }) => { response.status(200).setHeader("X-Test", "HEAD").end(); };
      `,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    await app.start();

    const { req, res } = makeMockReqRes("HEAD", "/users");
    let headerVal = "";
    res.raw.setHeader = ((key: string, val: string) => {
      if (key.toLowerCase() === "x-test") {
        headerVal = val;
      }
    }) as unknown as typeof res.raw.setHeader;

    await app.processRequest(req, res);
    expect(headerVal).toBe("HEAD");
  });

  it("ignores query strings when matching filesystem routes", async () => {
    const usersDir = path.join(tmpDir, "users");
    await fs.mkdir(usersDir, { recursive: true });
    await fs.writeFile(
      path.join(usersDir, "route.ts"),
      `export const GET = ({ response }) => { response.status(200).json({ ok: true }); };`,
      "utf-8",
    );

    const app = createTestApp(tmpDir);
    await app.start();

    const call = makeMockReqRes("GET", "/users?active=true&page=2");
    await app.processRequest(call.req, call.res);
    expect(call.getStatus()).toBe(200);
    expect(call.getData()).toEqual({ ok: true });
  });
});

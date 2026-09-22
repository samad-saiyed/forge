import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleBuildCommand, handleStartCommand } from "../../packages/cli/src/index.js";

function makeHttpRequest(
  url: string,
  method = "GET",
  body?: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 500, body: data, headers: res.headers }),
      );
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

describe("Action 70.11 — End-to-End TypeScript Production Integration Suite", () => {
  let tempDir: string;
  let stdoutLogs: string[];
  let stderrLogs: string[];

  const customStdout = (msg: string) => stdoutLogs.push(msg);
  const customStderr = (msg: string) => stderrLogs.push(msg);

  beforeEach(() => {
    tempDir = join(tmpdir(), `kyuu-e2e-ts-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    stdoutLogs = [];
    stderrLogs = [];
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it(
    "1. Comprehensive TypeScript Production E2E: Route matrix, HTTP methods, middleware, config, and params",
    { timeout: 20000 },
    async () => {
      // 1. Setup project configuration
      writeFileSync(
        join(tempDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext" } }),
      );
      writeFileSync(
        join(tempDir, "package.json"),
        JSON.stringify({ name: "e2e-ts-app", type: "module" }),
      );
      writeFileSync(join(tempDir, "kyuu.config.ts"), `export default { server: { port: 5301 } };`);

      // 2. Setup Route Tree
      // Root route: GET /
      mkdirSync(join(tempDir, "src", "app"), { recursive: true });
      writeFileSync(
        join(tempDir, "src", "app", "route.ts"),
        `export const GET = (_req: any, res: any) => { res.json({ route: "root" }); };`,
      );

      // Static users route: GET, POST /users
      mkdirSync(join(tempDir, "src", "app", "users"), { recursive: true });
      writeFileSync(
        join(tempDir, "src", "app", "users", "route.ts"),
        `
        export const GET = (_req: any, res: any) => { res.json({ route: "users-list" }); };
        export const POST = (_req: any, res: any) => { res.json({ route: "users-create" }); };
        `,
      );

      // Single dynamic param route: GET, PUT, PATCH, DELETE, OPTIONS, HEAD /users/:id
      mkdirSync(join(tempDir, "src", "app", "users", "[id]"), { recursive: true });
      writeFileSync(
        join(tempDir, "src", "app", "users", "[id]", "route.ts"),
        `
        export const GET = (req: any, res: any) => { res.json({ id: req.params.id, method: "GET" }); };
        export const PUT = (req: any, res: any) => { res.json({ id: req.params.id, method: "PUT" }); };
        export const PATCH = (req: any, res: any) => { res.json({ id: req.params.id, method: "PATCH" }); };
        export const DELETE = (req: any, res: any) => { res.json({ id: req.params.id, method: "DELETE" }); };
        export const OPTIONS = (_req: any, res: any) => { res.setHeader("allow", "GET, PUT, PATCH, DELETE").send(""); };
        export const HEAD = (_req: any, res: any) => { res.setHeader("x-custom-header", "head-ok").send(""); };
        `,
      );

      // Multi dynamic param route: GET /users/:id/posts/:postId
      mkdirSync(join(tempDir, "src", "app", "users", "[id]", "posts", "[postId]"), {
        recursive: true,
      });
      writeFileSync(
        join(tempDir, "src", "app", "users", "[id]", "posts", "[postId]", "route.ts"),
        `
        export const GET = (req: any, res: any) => {
          res.json({ id: req.params.id, postId: req.params.postId });
        };
        `,
      );

      // Wildcard route: GET /files/*filepath
      mkdirSync(join(tempDir, "src", "app", "files", "[...filepath]"), { recursive: true });
      writeFileSync(
        join(tempDir, "src", "app", "files", "[...filepath]", "route.ts"),
        `
        export const GET = (req: any, res: any) => {
          res.json({ filepath: req.params.filepath });
        };
        `,
      );

      // Health route: GET /health
      mkdirSync(join(tempDir, "src", "app", "health"), { recursive: true });
      writeFileSync(
        join(tempDir, "src", "app", "health", "route.ts"),
        `
        export const GET = (_req: any, res: any) => {
          res.json({ status: "healthy" });
        };
        `,
      );

      // 3. Build project
      const buildRes = await handleBuildCommand([], { projectRoot: tempDir });
      expect(buildRes.exitCode).toBe(0);

      // 4. Start production server
      const startRes = await handleStartCommand([], {
        projectRoot: tempDir,
        attachSignalHandlers: false,
        stdout: customStdout,
        stderr: customStderr,
      });

      expect(startRes.exitCode).toBe(0);
      expect(startRes.output).toContain("5301");

      try {
        // A. Root route /
        const rootRes = await makeHttpRequest("http://localhost:5301/");
        expect(rootRes.status).toBe(200);
        expect(JSON.parse(rootRes.body)).toEqual({ route: "root" });

        // B. Static route GET & POST /users
        const usersGet = await makeHttpRequest("http://localhost:5301/users", "GET");
        expect(JSON.parse(usersGet.body)).toEqual({ route: "users-list" });

        const usersPost = await makeHttpRequest("http://localhost:5301/users", "POST");
        expect(JSON.parse(usersPost.body)).toEqual({ route: "users-create" });

        // C. Single dynamic route /users/42 with method matrix
        const idGet = await makeHttpRequest("http://localhost:5301/users/42", "GET");
        expect(JSON.parse(idGet.body)).toEqual({ id: "42", method: "GET" });

        const idPut = await makeHttpRequest("http://localhost:5301/users/42", "PUT");
        expect(JSON.parse(idPut.body)).toEqual({ id: "42", method: "PUT" });

        const idPatch = await makeHttpRequest("http://localhost:5301/users/42", "PATCH");
        expect(JSON.parse(idPatch.body)).toEqual({ id: "42", method: "PATCH" });

        const idDelete = await makeHttpRequest("http://localhost:5301/users/42", "DELETE");
        expect(JSON.parse(idDelete.body)).toEqual({ id: "42", method: "DELETE" });

        const idOptions = await makeHttpRequest("http://localhost:5301/users/42", "OPTIONS");
        expect(idOptions.headers["allow"]).toBe("GET, PUT, PATCH, DELETE");

        const idHead = await makeHttpRequest("http://localhost:5301/users/42", "HEAD");
        expect(idHead.headers["x-custom-header"]).toBe("head-ok");

        // D. Multi dynamic params route /users/usr_100/posts/post_999
        const multiRes = await makeHttpRequest(
          "http://localhost:5301/users/usr_100/posts/post_999",
        );
        expect(JSON.parse(multiRes.body)).toEqual({ id: "usr_100", postId: "post_999" });

        // E. Wildcard route /files/static/images/logo.png
        const wildcardRes = await makeHttpRequest(
          "http://localhost:5301/files/static/images/logo.png",
        );
        expect(JSON.parse(wildcardRes.body)).toEqual({ filepath: "static/images/logo.png" });

        // F. Health route /health
        const healthRes = await makeHttpRequest("http://localhost:5301/health");
        expect(JSON.parse(healthRes.body)).toEqual({ status: "healthy" });
      } finally {
        if (startRes.runnerResult?.app) {
          await startRes.runnerResult.app.close();
        }
      }
    },
  );

  it("2. Rebuild & Failed Rebuild Regression Matrix", { timeout: 20000 }, async () => {
    // Setup initial project
    writeFileSync(
      join(tempDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext" } }),
    );
    writeFileSync(join(tempDir, "kyuu.config.ts"), `export default { server: { port: 5302 } };`);
    mkdirSync(join(tempDir, "src", "app", "v1"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "v1", "route.ts"),
      `export const GET = (_req: any, res: any) => { res.json({ version: 1 }); };`,
    );

    // Build A
    const buildA = await handleBuildCommand([], { projectRoot: tempDir });
    expect(buildA.exitCode).toBe(0);

    // Start A
    const startA = await handleStartCommand([], {
      projectRoot: tempDir,
      attachSignalHandlers: false,
    });
    expect(startA.exitCode).toBe(0);
    try {
      const resA = await makeHttpRequest("http://localhost:5302/v1");
      expect(JSON.parse(resA.body)).toEqual({ version: 1 });
    } finally {
      await startA.runnerResult?.app.close();
    }

    // Modify source for Build B
    writeFileSync(
      join(tempDir, "src", "app", "v1", "route.ts"),
      `export const GET = (_req: any, res: any) => { res.json({ version: 2 }); };`,
    );

    // Build B
    const buildB = await handleBuildCommand([], { projectRoot: tempDir });
    expect(buildB.exitCode).toBe(0);

    // Start B
    const startB = await handleStartCommand([], {
      projectRoot: tempDir,
      attachSignalHandlers: false,
    });
    expect(startB.exitCode).toBe(0);
    try {
      const resB = await makeHttpRequest("http://localhost:5302/v1");
      expect(JSON.parse(resB.body)).toEqual({ version: 2 });
    } finally {
      await startB.runnerResult?.app.close();
    }

    // Introduce syntax error for Build C (Failed rebuild)
    writeFileSync(join(tempDir, "src", "app", "v1", "route.ts"), `SYNTAX ERROR INVALID TS {{{`);

    const buildC = await handleBuildCommand([], { projectRoot: tempDir });
    expect(buildC.exitCode).toBe(1);

    // Start after failed build should STILL serve Build B!
    const startC = await handleStartCommand([], {
      projectRoot: tempDir,
      attachSignalHandlers: false,
    });
    expect(startC.exitCode).toBe(0);
    try {
      const resC = await makeHttpRequest("http://localhost:5302/v1");
      expect(JSON.parse(resC.body)).toEqual({ version: 2 });
    } finally {
      await startC.runnerResult?.app.close();
    }
  });
});

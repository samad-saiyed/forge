import { describe, it, expect, afterEach } from "vitest";
import * as http from "node:http";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import {
  createApp,
  defineRoute,
  createSchema,
  KyuuValidationError,
  type Application,
} from "../../packages/core/src/index.js";

async function makeRequest(
  server: http.Server,
  method: string,
  urlPath: string,
  headers?: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: unknown }> {
  return new Promise((resolve, reject) => {
    const address = server.address() as { port: number };
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = { ...headers };

    if (payload && !reqHeaders["content-type"]) {
      reqHeaders["content-type"] = "application/json";
    }
    if (payload && !reqHeaders["content-length"]) {
      reqHeaders["content-length"] = String(Buffer.byteLength(payload));
    }

    const req = http.request(
      `http://127.0.0.1:${address.port}${urlPath}`,
      { method, headers: reqHeaders },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: parsed,
          });
        });
      },
    );

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

describe("Action 72.5 — Standard Kyuu Validation Error Contract", () => {
  let app: Application;
  let server: http.Server;
  let tempAppDir: string | undefined;

  afterEach(async () => {
    if (server && server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (tempAppDir && fs.existsSync(tempAppDir)) {
      fs.rmSync(tempAppDir, { recursive: true, force: true });
      tempAppDir = undefined;
    }
  });

  it("returns 400 Bad Request with VALIDATION_ERROR and details for body failure", async () => {
    const bodySchema = createSchema((input: unknown) => {
      const b = input as { email?: unknown };
      if (!b || typeof b.email !== "string") {
        return {
          success: false,
          error: {
            issues: [{ path: ["email"], message: "Invalid email address" }],
          },
        };
      }
      return { success: true, data: b };
    });

    let handlerCalled = false;
    app = createApp({ skipFsRouting: true });
    app.post(
      "/user",
      defineRoute({ validate: { body: bodySchema } }, async (_req, res) => {
        handlerCalled = true;
        res.json({ ok: true });
      }),
    );

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const res = await makeRequest(server, "POST", "/user", {}, { email: 123 });

    expect(res.status).toBe(400);
    expect(handlerCalled).toBe(false);
    expect(res.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: [
          {
            source: "body",
            path: ["email"],
            message: "Invalid email address",
          },
        ],
      },
    });
  });

  it("returns 400 for query validation failure with source=query", async () => {
    const querySchema = createSchema((input: unknown) => {
      const q = input as Record<string, unknown>;
      if (!q || !q.page) {
        return {
          success: false,
          error: {
            issues: [{ path: ["page"], message: "Page is required" }],
          },
        };
      }
      return { success: true, data: q };
    });

    app = createApp({ skipFsRouting: true });
    app.get(
      "/items",
      defineRoute({ validate: { query: querySchema } }, async (_req, res) => {
        res.json({ ok: true });
      }),
    );

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const res = await makeRequest(server, "GET", "/items");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: [
          {
            source: "query",
            path: ["page"],
            message: "Page is required",
          },
        ],
      },
    });
  });

  it("returns 400 for params validation failure with source=params", async () => {
    const paramsSchema = createSchema((input: unknown) => {
      const p = input as { id?: string };
      if (p?.id !== "123") {
        return {
          success: false,
          error: {
            issues: [{ path: ["id"], message: "Must be a valid numeric ID string" }],
          },
        };
      }
      return { success: true, data: p };
    });

    app = createApp({ skipFsRouting: true });
    app.get(
      "/users/:id",
      defineRoute({ validate: { params: paramsSchema } }, async (_req, res) => {
        res.json({ ok: true });
      }),
    );

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const res = await makeRequest(server, "GET", "/users/abc");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: [
          {
            source: "params",
            path: ["id"],
            message: "Must be a valid numeric ID string",
          },
        ],
      },
    });
  });

  it("returns 400 for headers validation failure with source=headers", async () => {
    const headersSchema = createSchema((input: unknown) => {
      const h = input as Record<string, string | undefined>;
      if (!h?.["x-api-key"]) {
        return {
          success: false,
          error: {
            issues: [{ path: ["x-api-key"], message: "API key header is missing" }],
          },
        };
      }
      return { success: true, data: h };
    });

    app = createApp({ skipFsRouting: true });
    app.get(
      "/protected",
      defineRoute({ validate: { headers: headersSchema } }, async (_req, res) => {
        res.json({ ok: true });
      }),
    );

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const res = await makeRequest(server, "GET", "/protected");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: [
          {
            source: "headers",
            path: ["x-api-key"],
            message: "API key header is missing",
          },
        ],
      },
    });
  });

  it("correctly preserves nested paths and numeric array index paths", async () => {
    const nestedSchema = createSchema(() => {
      return {
        success: false,
        error: {
          issues: [
            { path: ["user", "profile", "email"], message: "Invalid email" },
            { path: ["users", 0, "email"], message: "First user email invalid" },
          ],
        },
      };
    });

    app = createApp({ skipFsRouting: true });
    app.post(
      "/nested",
      defineRoute({ validate: { body: nestedSchema } }, async (_req, res) => {
        res.json({ ok: true });
      }),
    );

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const res = await makeRequest(server, "POST", "/nested", {}, {});

    expect(res.status).toBe(400);
    expect((res.body as { error: { details: unknown[] } }).error.details).toEqual([
      {
        source: "body",
        path: ["user", "profile", "email"],
        message: "Invalid email",
      },
      {
        source: "body",
        path: ["users", 0, "email"],
        message: "First user email invalid",
      },
    ]);
  });

  it("preserves multiple issues reported by the same schema", async () => {
    const multiIssueSchema = createSchema(() => {
      return {
        success: false,
        error: {
          issues: [
            { path: ["name"], message: "Name is required" },
            { path: ["age"], message: "Age must be positive" },
          ],
        },
      };
    });

    app = createApp({ skipFsRouting: true });
    app.post(
      "/multi",
      defineRoute({ validate: { body: multiIssueSchema } }, async (_req, res) => {
        res.json({ ok: true });
      }),
    );

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const res = await makeRequest(server, "POST", "/multi", {}, {});

    expect(res.status).toBe(400);
    const details = (res.body as { error: { details: unknown[] } }).error.details;
    expect(details).toHaveLength(2);
    expect(details).toEqual([
      { source: "body", path: ["name"], message: "Name is required" },
      { source: "body", path: ["age"], message: "Age must be positive" },
    ]);
  });

  it("allows custom error middleware to intercept KyuuValidationError and customize response", async () => {
    const bodySchema = createSchema(() => ({
      success: false,
      error: { issues: [{ path: ["field"], message: "Bad field" }] },
    }));

    app = createApp({ skipFsRouting: true });

    app.post(
      "/custom",
      defineRoute({ validate: { body: bodySchema } }, async (_req, res) => {
        res.json({ ok: true });
      }),
    );

    // Custom error middleware registered after the route
    app.use(async (err: unknown, _req: unknown, res: unknown, next: unknown) => {
      const response = res as { status: (code: number) => { json: (data: unknown) => void } };
      const nextFn = next as (err?: unknown) => Promise<void>;

      if (err instanceof KyuuValidationError) {
        response.status(422).json({
          customError: true,
          firstIssue: err.details[0]?.message,
        });
        return;
      }
      await nextFn(err);
    });

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const res = await makeRequest(server, "POST", "/custom", {}, {});

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      customError: true,
      firstIssue: "Bad field",
    });
  });

  it("produces identical validation error response for filesystem routes", async () => {
    tempAppDir = fs.mkdtempSync(path.join(os.tmpdir(), "kyuu-val-err-test-"));
    const signupDir = path.join(tempAppDir, "signup");
    fs.mkdirSync(signupDir, { recursive: true });

    const coreIndexPath = path.resolve("packages/core/dist/index.js").replace(/\\/g, "/");

    const routeFileContent = `
      import { defineRoute, createSchema } from "file:///${coreIndexPath}";

      const bodySchema = createSchema(() => ({
        success: false,
        error: { issues: [{ path: ["username"], message: "Username taken" }] },
      }));

      export const POST = defineRoute({ validate: { body: bodySchema } }, async (_req, res) => {
        res.json({ ok: true });
      });
    `;

    fs.writeFileSync(path.join(signupDir, "route.js"), routeFileContent);

    app = createApp({ appDir: tempAppDir });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const res = await makeRequest(server, "POST", "/signup", {}, {});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: [
          {
            source: "body",
            path: ["username"],
            message: "Username taken",
          },
        ],
      },
    });
  });

  it("regression check: non-validation handler errors remain 500 internal server errors", async () => {
    app = createApp({ skipFsRouting: true });

    app.get("/error", async () => {
      throw new Error("Something broke inside handler");
    });

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const res = await makeRequest(server, "GET", "/error");

    expect(res.status).toBe(500);
    const errBody = res.body as { error: string };
    expect(errBody.error).toBe("Internal Server Error");
    expect(errBody.error).not.toBe("VALIDATION_ERROR");
  });
});

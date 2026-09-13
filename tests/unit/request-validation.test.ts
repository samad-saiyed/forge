import type { AddressInfo } from "node:net";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createApp,
  createSchema,
  defineRoute,
  type Application,
  type ErrorMiddleware,
} from "../../packages/core/src/index.js";

async function setupTestServer(app: Application) {
  const server = app.listen(0);
  if (!server.listening) {
    await new Promise((r) => server.once("listening", r));
  }
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const doRequest = async (
    method: string,
    urlPath: string,
    options?: { headers?: Record<string, string>; body?: string },
  ) => {
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: options?.headers,
      body: options?.body,
    });
    const text = await res.text();
    return {
      status: res.status,
      body: text,
      json: () => JSON.parse(text),
    };
  };

  const close = () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

  return { doRequest, close };
}

describe("Action 72.4 — Request Validation Pipeline", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-val-pipeline-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("validates request params before executing handler", async () => {
    const paramsSchema = createSchema<{ id: string }>((input) => {
      const p = input as Record<string, string>;
      if (p.id === "123") {
        return { success: true, data: { id: "123" } };
      }
      return {
        success: false,
        error: { issues: [{ path: ["params", "id"], message: "Invalid ID" }] },
      };
    });

    const handlerSpy = vi.fn((req, res) => {
      res.json({ id: req.params.id });
    });

    const app = createApp({ skipFsRouting: true });
    app.get(
      "/users/:id",
      defineRoute(
        {
          validate: { params: paramsSchema },
        },
        handlerSpy,
      ),
    );

    const { doRequest, close } = await setupTestServer(app);
    try {
      const validRes = await doRequest("GET", "/users/123");
      expect(validRes.status).toBe(200);
      expect(validRes.json()).toEqual({ id: "123" });
      expect(handlerSpy).toHaveBeenCalledTimes(1);

      handlerSpy.mockClear();

      const invalidRes = await doRequest("GET", "/users/999");
      expect(invalidRes.status).toBe(400);
      expect(handlerSpy).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("validates query parameters before executing handler", async () => {
    const querySchema = createSchema<{ search: string }>((input) => {
      const q = input as Record<string, string>;
      if (q.search && q.search.length >= 3) {
        return { success: true, data: { search: q.search } };
      }
      return {
        success: false,
        error: { issues: [{ path: ["query", "search"], message: "Search term too short" }] },
      };
    });

    const handlerSpy = vi.fn((req, res) => {
      res.json({ search: req.query.search });
    });

    const app = createApp({ skipFsRouting: true });
    app.get(
      "/search",
      defineRoute(
        {
          validate: { query: querySchema },
        },
        handlerSpy,
      ),
    );

    const { doRequest, close } = await setupTestServer(app);
    try {
      const validRes = await doRequest("GET", "/search?search=forge");
      expect(validRes.status).toBe(200);
      expect(validRes.json()).toEqual({ search: "forge" });
      expect(handlerSpy).toHaveBeenCalledTimes(1);

      handlerSpy.mockClear();

      const invalidRes = await doRequest("GET", "/search?search=ab");
      expect(invalidRes.status).toBe(400);
      expect(handlerSpy).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("validates request headers before executing handler", async () => {
    const headersSchema = createSchema<{ "x-api-key": string }>((input) => {
      const h = input as Record<string, string | undefined>;
      if (h["x-api-key"] === "secret-token") {
        return { success: true, data: { "x-api-key": "secret-token" } };
      }
      return {
        success: false,
        error: { issues: [{ path: ["headers", "x-api-key"], message: "Invalid API key" }] },
      };
    });

    const handlerSpy = vi.fn((req, res) => {
      res.json({ authorized: true });
    });

    const app = createApp({ skipFsRouting: true });
    app.get(
      "/protected",
      defineRoute(
        {
          validate: { headers: headersSchema },
        },
        handlerSpy,
      ),
    );

    const { doRequest, close } = await setupTestServer(app);
    try {
      const validRes = await doRequest("GET", "/protected", {
        headers: { "x-api-key": "secret-token" },
      });
      expect(validRes.status).toBe(200);
      expect(handlerSpy).toHaveBeenCalledTimes(1);

      handlerSpy.mockClear();

      const invalidRes = await doRequest("GET", "/protected", {
        headers: { "x-api-key": "wrong-token" },
      });
      expect(invalidRes.status).toBe(400);
      expect(handlerSpy).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("validates request body after body parsing", async () => {
    const bodySchema = createSchema<{ age: number }>((input) => {
      const b = input as { age?: unknown };
      if (typeof b?.age === "number" && b.age >= 18) {
        return { success: true, data: { age: b.age } };
      }
      return {
        success: false,
        error: { issues: [{ path: ["body", "age"], message: "Must be 18 or older" }] },
      };
    });

    const handlerSpy = vi.fn(async (req, res) => {
      const body = await req.body;
      res.json({ age: body.age });
    });

    const app = createApp({ skipFsRouting: true });
    app.post(
      "/verify-age",
      defineRoute(
        {
          validate: { body: bodySchema },
        },
        handlerSpy,
      ),
    );

    const { doRequest, close } = await setupTestServer(app);
    try {
      const validRes = await doRequest("POST", "/verify-age", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ age: 25 }),
      });
      expect(validRes.status).toBe(200);
      expect(validRes.json()).toEqual({ age: 25 });
      expect(handlerSpy).toHaveBeenCalledTimes(1);

      handlerSpy.mockClear();

      const invalidRes = await doRequest("POST", "/verify-age", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ age: 15 }),
      });
      expect(invalidRes.status).toBe(400);
      expect(handlerSpy).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("stores transformed values (coercion '25' -> 25) so handler receives transformed types", async () => {
    const transformSchema = createSchema<{ age: number }>((input) => {
      const b = input as { age?: unknown };
      const num = Number(b?.age);
      if (!isNaN(num)) {
        return { success: true, data: { age: num } };
      }
      return {
        success: false,
        error: { issues: [{ path: ["body", "age"], message: "Invalid number" }] },
      };
    });

    const app = createApp({ skipFsRouting: true });
    app.post(
      "/transform",
      defineRoute(
        {
          validate: { body: transformSchema },
        },
        async (req, res) => {
          const body = (await req.body) as { age: number };
          res.json({
            receivedType: typeof body.age,
            receivedValue: body.age,
          });
        },
      ),
    );

    const { doRequest, close } = await setupTestServer(app);
    try {
      const res = await doRequest("POST", "/transform", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ age: "25" }),
      });
      expect(res.status).toBe(200);
      expect(res.json()).toEqual({
        receivedType: "number",
        receivedValue: 25,
      });
    } finally {
      await close();
    }
  });

  it("executes multiple schemas in deterministic order (params -> query -> headers -> body) and short-circuits on failure", async () => {
    const executionOrder: string[] = [];

    const paramsSchema = createSchema((input) => {
      executionOrder.push("params");
      const p = input as Record<string, string>;
      if (p.id === "fail-params") {
        return { success: false, error: { issues: [{ message: "params error" }] } };
      }
      return { success: true, data: input };
    });

    const querySchema = createSchema((input) => {
      executionOrder.push("query");
      return { success: true, data: input };
    });

    const headersSchema = createSchema((input) => {
      executionOrder.push("headers");
      return { success: true, data: input };
    });

    const bodySchema = createSchema((input) => {
      executionOrder.push("body");
      return { success: true, data: input };
    });

    const app = createApp({ skipFsRouting: true });
    app.post(
      "/multi/:id",
      defineRoute(
        {
          validate: {
            params: paramsSchema,
            query: querySchema,
            headers: headersSchema,
            body: bodySchema,
          },
        },
        async (req, res) => {
          executionOrder.push("handler");
          res.json({ ok: true });
        },
      ),
    );

    const { doRequest, close } = await setupTestServer(app);
    try {
      const fullRes = await doRequest("POST", "/multi/123", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true }),
      });
      expect(fullRes.status).toBe(200);
      expect(executionOrder).toEqual(["params", "query", "headers", "body", "handler"]);

      executionOrder.length = 0;

      const shortCircuitRes = await doRequest("POST", "/multi/fail-params", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true }),
      });
      expect(shortCircuitRes.status).toBe(400);
      expect(executionOrder).toEqual(["params"]);
    } finally {
      await close();
    }
  });

  it("awaits asynchronous schemas before invoking route handler", async () => {
    const asyncSchema = createSchema(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { success: true, data: { ok: true } };
    });

    const app = createApp({ skipFsRouting: true });
    app.post(
      "/async-val",
      defineRoute(
        {
          validate: { body: asyncSchema },
        },
        async (req, res) => {
          const body = await req.body;
          res.json(body);
        },
      ),
    );

    const { doRequest, close } = await setupTestServer(app);
    try {
      const res = await doRequest("POST", "/async-val", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true }),
      });
      expect(res.status).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    } finally {
      await close();
    }
  });

  it("routes without validation pass through directly without schema execution overhead", async () => {
    const app = createApp({ skipFsRouting: true });
    app.get("/unvalidated", (_req, res) => {
      res.json({ plain: true });
    });

    const { doRequest, close } = await setupTestServer(app);
    try {
      const res = await doRequest("GET", "/unvalidated");
      expect(res.status).toBe(200);
      expect(res.json()).toEqual({ plain: true });
    } finally {
      await close();
    }
  });

  it("propagates validation failure errors to existing error middleware", async () => {
    const failingSchema = createSchema(() => {
      return {
        success: false,
        error: { issues: [{ path: ["body"], message: "Validation error test" }] },
      };
    });

    const app = createApp({ skipFsRouting: true });

    let caughtError: unknown = null;

    app.post(
      "/error-test",
      defineRoute(
        {
          validate: { body: failingSchema },
        },
        (_req, res) => {
          res.json({ ok: true });
        },
      ),
    );

    const errorHandler: ErrorMiddleware = async (err, _req, res, _next) => {
      void _next;
      caughtError = err;
      res.status(422).json({ customErrorHandled: true });
    };
    app.use(errorHandler);

    const { doRequest, close } = await setupTestServer(app);
    try {
      const res = await doRequest("POST", "/error-test");
      expect(res.status).toBe(422);
      expect(res.json()).toEqual({ customErrorHandled: true });
      expect(caughtError).toBeDefined();
    } finally {
      await close();
    }
  });

  it("executes validation on filesystem routes using defineRoute", async () => {
    const coreIndexUrl = pathToFileURL(
      path.resolve(process.cwd(), "packages/core/src/index.ts"),
    ).href;
    const appDir = path.join(tempDir, "src/app");
    fs.mkdirSync(appDir, { recursive: true });

    const routeFile = path.join(appDir, "route.ts");
    fs.writeFileSync(
      routeFile,
      `
      import { defineRoute, createSchema } from ${JSON.stringify(coreIndexUrl)};

      const bodySchema = createSchema((input) => {
        const b = input as { name?: string };
        if (b && b.name === "valid") {
          return { success: true, data: { name: "VALID_TRANSFORMED" } };
        }
        return { success: false, error: { issues: [{ message: "Invalid name" }] } };
      });

      export const POST = defineRoute(
        {
          validate: { body: bodySchema },
        },
        async ({ request, response }) => {
          const body = await request.body;
          response.json({ name: body.name });
        }
      );
      `,
    );

    const app = createApp({ appDir });
    const { doRequest, close } = await setupTestServer(app);

    try {
      const validRes = await doRequest("POST", "/", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "valid" }),
      });
      expect(validRes.status).toBe(200);
      expect(validRes.json()).toEqual({ name: "VALID_TRANSFORMED" });

      const invalidRes = await doRequest("POST", "/", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "invalid" }),
      });
      expect(invalidRes.status).toBe(400);
    } finally {
      await close();
    }
  });

  it("executes params validation on dynamic filesystem routes", async () => {
    const coreIndexUrl = pathToFileURL(
      path.resolve(process.cwd(), "packages/core/src/index.ts"),
    ).href;
    const appDir = path.join(tempDir, "src/app");
    const routeSubDir = path.join(appDir, "users/[id]");
    fs.mkdirSync(routeSubDir, { recursive: true });

    const routeFile = path.join(routeSubDir, "route.ts");
    fs.writeFileSync(
      routeFile,
      `
      import { defineRoute, createSchema } from ${JSON.stringify(coreIndexUrl)};

      const paramsSchema = createSchema((input) => {
        const p = input as { id?: string };
        if (p && p.id === "123") {
          return { success: true, data: { id: "NUM_123" } };
        }
        return { success: false, error: { issues: [{ message: "Invalid param" }] } };
      });

      export const GET = defineRoute(
        {
          validate: { params: paramsSchema },
        },
        ({ request, response }) => {
          response.json({ id: request.params.id });
        }
      );
      `,
    );

    const app = createApp({ appDir });
    const { doRequest, close } = await setupTestServer(app);

    try {
      const validRes = await doRequest("GET", "/users/123");
      expect(validRes.status).toBe(200);
      expect(validRes.json()).toEqual({ id: "NUM_123" });

      const invalidRes = await doRequest("GET", "/users/999");
      expect(invalidRes.status).toBe(400);
    } finally {
      await close();
    }
  });
});

import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createApp,
  createSchema,
  defineRoute,
  ResponseValidationError,
  type Application,
  type ErrorMiddleware,
} from "../../packages/core/src/index.js";
import { zodSchema } from "../../packages/zod/src/index.js";

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

describe("Action 72.8 — Response Schema Contract Unit Suite", () => {
  it("allows valid response payload and returns 200 OK with expected JSON body", async () => {
    const ResponseSchema = createSchema<{ id: string; name: string }>((input) => {
      const b = input as { id?: string; name?: string };
      if (b && typeof b.id === "string" && typeof b.name === "string") {
        return { success: true, data: { id: b.id, name: b.name } };
      }
      return { success: false, error: { issues: [{ message: "Invalid response shape" }] } };
    });

    const route = defineRoute(
      {
        response: ResponseSchema,
      },
      (_req, res) => {
        res.json({ id: "usr_1", name: "Alice" });
      },
    );

    const app = createApp({ skipFsRouting: true });
    app.get("/valid-response", route);

    const { doRequest, close } = await setupTestServer(app);
    try {
      const res = await doRequest("GET", "/valid-response");
      expect(res.status).toBe(200);
      expect(res.json()).toEqual({ id: "usr_1", name: "Alice" });
    } finally {
      await close();
    }
  });

  it("yields 500 Internal Server Error when response payload violates response schema (not 400)", async () => {
    const ResponseSchema = createSchema<{ id: string; name: string }>((input) => {
      const b = input as { id?: string; name?: string };
      if (b && typeof b.id === "string" && typeof b.name === "string") {
        return { success: true, data: { id: b.id, name: b.name } };
      }
      return { success: false, error: { issues: [{ message: "Missing required name property" }] } };
    });

    const route = defineRoute(
      {
        response: ResponseSchema,
      },
      (_req, res) => {
        // Invalid response payload (name missing)
        res.json({ id: "usr_1" } as unknown as { id: string; name: string });
      },
    );

    const app = createApp({ skipFsRouting: true });
    app.get("/invalid-response", route);

    const { doRequest, close } = await setupTestServer(app);
    try {
      const res = await doRequest("GET", "/invalid-response");
      expect(res.status).toBe(500);
      expect(res.json()).toEqual({
        error: "Internal Server Error",
        message: expect.stringContaining("Response validation failed"),
      });
    } finally {
      await close();
    }
  });

  it("unconfigured routes (no response schema) bypass response validation completely", async () => {
    const app = createApp({ skipFsRouting: true });
    app.get("/plain", (_req, res) => {
      res.json({ anything: true, count: 42 });
    });

    const { doRequest, close } = await setupTestServer(app);
    try {
      const res = await doRequest("GET", "/plain");
      expect(res.status).toBe(200);
      expect(res.json()).toEqual({ anything: true, count: 42 });
    } finally {
      await close();
    }
  });

  it("validates response payload with direct Zod schema and Zod adapter", async () => {
    const UserZodSchema = z.object({
      id: z.string(),
      email: z.string().email(),
    });

    const validRoute = defineRoute(
      {
        response: UserZodSchema,
      },
      (_req, res) => {
        res.json({ id: "u123", email: "samad@example.com" });
      },
    );

    const invalidRoute = defineRoute(
      {
        response: zodSchema(UserZodSchema),
      },
      (_req, res) => {
        res.json({ id: "u123", email: "invalid-email" } as unknown as {
          id: string;
          email: string;
        });
      },
    );

    const app = createApp({ skipFsRouting: true });
    app.get("/zod-valid", validRoute);
    app.get("/zod-invalid", invalidRoute);

    const { doRequest, close } = await setupTestServer(app);
    try {
      const validRes = await doRequest("GET", "/zod-valid");
      expect(validRes.status).toBe(200);
      expect(validRes.json()).toEqual({ id: "u123", email: "samad@example.com" });

      const invalidRes = await doRequest("GET", "/zod-invalid");
      expect(invalidRes.status).toBe(500);
    } finally {
      await close();
    }
  });

  it("propagates ResponseValidationError to error middleware", async () => {
    const ResponseSchema = z.object({
      status: z.literal("active"),
    });

    const route = defineRoute(
      {
        response: ResponseSchema,
      },
      (_req, res) => {
        res.json({ status: "inactive" } as unknown as { status: "active" });
      },
    );

    let caughtError: unknown = null;

    const app = createApp({ skipFsRouting: true });
    app.get("/middleware-error", route);

    const errorHandler: ErrorMiddleware = (err, _req, res, _next) => {
      void _next;
      caughtError = err;
      res.status(500).json({ customHandledResponseError: true });
    };
    app.use(errorHandler);

    const { doRequest, close } = await setupTestServer(app);
    try {
      const res = await doRequest("GET", "/middleware-error");
      expect(res.status).toBe(500);
      expect(res.json()).toEqual({ customHandledResponseError: true });
      expect(caughtError).toBeInstanceOf(ResponseValidationError);
      expect((caughtError as ResponseValidationError).code).toBe("RESPONSE_VALIDATION_ERROR");
    } finally {
      await close();
    }
  });
});

import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp, defineRoute, type Application } from "../../packages/core/src/index.js";
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

describe("Action 72.7 — Zod Schema Adapter Unit Suite", () => {
  it("validates sync Zod schema and passes transformed output to handler", async () => {
    const UserSchema = z.object({
      name: z.string().min(2),
      age: z.coerce.number(),
    });

    const route = defineRoute(
      {
        validate: {
          body: UserSchema,
        },
      },
      async (req, res) => {
        const body = await req.body;
        res.json({ name: body.name, age: body.age });
      },
    );

    const app = createApp({ skipFsRouting: true });
    app.post("/users", route);

    const { doRequest, close } = await setupTestServer(app);
    try {
      const res = await doRequest("POST", "/users", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Alice", age: "30" }),
      });
      expect(res.status).toBe(200);
      expect(res.json()).toEqual({ name: "Alice", age: 30 });
    } finally {
      await close();
    }
  });

  it("validates async Zod schema correctly", async () => {
    const AsyncSchema = z.object({
      username: z.string().refine(async (val) => {
        await new Promise((r) => setTimeout(r, 10));
        return val !== "taken";
      }, "Username is taken"),
    });

    const route = defineRoute(
      {
        validate: {
          body: AsyncSchema,
        },
      },
      async (req, res) => {
        const body = await req.body;
        res.json({ ok: true, username: body.username });
      },
    );

    const app = createApp({ skipFsRouting: true });
    app.post("/check-username", route);

    const { doRequest, close } = await setupTestServer(app);
    try {
      const validRes = await doRequest("POST", "/check-username", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "available_user" }),
      });
      expect(validRes.status).toBe(200);
      expect(validRes.json()).toEqual({ ok: true, username: "available_user" });

      const invalidRes = await doRequest("POST", "/check-username", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "taken" }),
      });
      expect(invalidRes.status).toBe(400);
      expect(invalidRes.json()).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: [
            {
              source: "body",
              path: ["username"],
              message: "Username is taken",
            },
          ],
        },
      });
    } finally {
      await close();
    }
  });

  it("normalizes Zod error for nested objects and preserves nested path array", async () => {
    const NestedSchema = z.object({
      user: z.object({
        profile: z.object({
          email: z.string().email(),
        }),
      }),
    });

    const route = defineRoute(
      {
        validate: {
          body: zodSchema(NestedSchema),
        },
      },
      async (_req, res) => {
        res.json({ ok: true });
      },
    );

    const app = createApp({ skipFsRouting: true });
    app.post("/nested", route);

    const { doRequest, close } = await setupTestServer(app);
    try {
      const res = await doRequest("POST", "/nested", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user: {
            profile: {
              email: "not-an-email",
            },
          },
        }),
      });
      expect(res.status).toBe(400);
      expect(res.json()).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: [
            {
              source: "body",
              path: ["user", "profile", "email"],
              message: "Invalid email",
            },
          ],
        },
      });
    } finally {
      await close();
    }
  });

  it("normalizes Zod error for array index elements and preserves array paths", async () => {
    const ArraySchema = z.object({
      items: z.array(
        z.object({
          id: z.string(),
          price: z.number().positive(),
        }),
      ),
    });

    const route = defineRoute(
      {
        validate: {
          body: ArraySchema,
        },
      },
      async (_req, res) => {
        res.json({ ok: true });
      },
    );

    const app = createApp({ skipFsRouting: true });
    app.post("/items", route);

    const { doRequest, close } = await setupTestServer(app);
    try {
      const res = await doRequest("POST", "/items", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: [
            { id: "item1", price: 10 },
            { id: "item2", price: -5 },
          ],
        }),
      });
      expect(res.status).toBe(400);
      const details = res.json().error.details;
      expect(details).toHaveLength(1);
      expect(details[0].source).toBe("body");
      expect(details[0].path).toEqual(["items", 1, "price"]);
    } finally {
      await close();
    }
  });

  it("validates params, query, headers, and body simultaneously with Zod schemas", async () => {
    const ParamsSchema = z.object({
      id: z.string().uuid(),
    });

    const QuerySchema = z.object({
      page: z.coerce.number().min(1),
    });

    const HeadersSchema = z.object({
      "x-client-id": z.string().min(1),
    });

    const BodySchema = z.object({
      title: z.string().min(3),
    });

    const route = defineRoute(
      {
        validate: {
          params: ParamsSchema,
          query: QuerySchema,
          headers: HeadersSchema,
          body: BodySchema,
        },
      },
      async (req, res) => {
        const body = await req.body;
        res.json({
          id: req.params.id,
          page: req.query.page,
          clientId: req.headers["x-client-id"],
          title: body.title,
        });
      },
    );

    const app = createApp({ skipFsRouting: true });
    app.post("/posts/:id", route);

    const { doRequest, close } = await setupTestServer(app);
    try {
      const validRes = await doRequest(
        "POST",
        "/posts/123e4567-e89b-12d3-a456-426614174000?page=2",
        {
          headers: {
            "content-type": "application/json",
            "x-client-id": "client-abc",
          },
          body: JSON.stringify({ title: "Hello World" }),
        },
      );

      expect(validRes.status).toBe(200);
      expect(validRes.json()).toEqual({
        id: "123e4567-e89b-12d3-a456-426614174000",
        page: 2,
        clientId: "client-abc",
        title: "Hello World",
      });

      // Invalid query
      const invalidQueryRes = await doRequest(
        "POST",
        "/posts/123e4567-e89b-12d3-a456-426614174000?page=0",
        {
          headers: {
            "content-type": "application/json",
            "x-client-id": "client-abc",
          },
          body: JSON.stringify({ title: "Hello World" }),
        },
      );

      expect(invalidQueryRes.status).toBe(400);
      expect(invalidQueryRes.json().error.details[0].source).toBe("query");
      expect(invalidQueryRes.json().error.details[0].path).toEqual(["page"]);
    } finally {
      await close();
    }
  });
});

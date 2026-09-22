import type { AddressInfo } from "node:net";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type Application } from "../../packages/core/src/index.js";

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

describe("Action 72.7 — Zod Integration with Filesystem Routing", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kyuu-zod-fs-routing-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("executes Zod validation on filesystem route and returns transformed values on success", async () => {
    const coreIndexUrl = pathToFileURL(
      path.resolve(process.cwd(), "packages/core/src/index.ts"),
    ).href;
    const zodIndexUrl = pathToFileURL(
      path.resolve(process.cwd(), "packages/zod/src/index.ts"),
    ).href;

    const appDir = path.join(tempDir, "src/app");
    const routeSubDir = path.join(appDir, "users/[id]");
    fs.mkdirSync(routeSubDir, { recursive: true });

    const routeFile = path.join(routeSubDir, "route.ts");
    fs.writeFileSync(
      routeFile,
      `
      import { z } from "zod";
      import { defineRoute } from ${JSON.stringify(coreIndexUrl)};
      import { zodSchema } from ${JSON.stringify(zodIndexUrl)};

      const ParamsSchema = z.object({
        id: z.string().min(3),
      });

      const BodySchema = z.object({
        name: z.string().min(2),
        age: z.coerce.number(),
      });

      export const POST = defineRoute(
        {
          validate: {
            params: ParamsSchema,
            body: BodySchema,
          },
        },
        async ({ request, response }) => {
          const body = await request.body;
          response.json({
            id: request.params.id,
            name: body.name,
            age: body.age,
          });
        }
      );
      `,
    );

    const app = createApp({ appDir });
    const { doRequest, close } = await setupTestServer(app);

    try {
      // 1. Valid request
      const validRes = await doRequest("POST", "/users/usr_42", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Samad", age: "28" }),
      });

      expect(validRes.status).toBe(200);
      expect(validRes.json()).toEqual({
        id: "usr_42",
        name: "Samad",
        age: 28,
      });

      // 2. Invalid request
      const invalidRes = await doRequest("POST", "/users/ab", {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Samad", age: "28" }),
      });

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.json()).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: [
            {
              source: "params",
              path: ["id"],
              message: "String must contain at least 3 character(s)",
            },
          ],
        },
      });
    } finally {
      await close();
    }
  });
});

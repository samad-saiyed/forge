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

describe("Action 72.8 — Response Schema Integration with Filesystem Routing", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-response-fs-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("executes response validation on filesystem routes using defineRoute", async () => {
    const coreIndexUrl = pathToFileURL(
      path.resolve(process.cwd(), "packages/core/src/index.ts"),
    ).href;
    const zodIndexUrl = pathToFileURL(
      path.resolve(process.cwd(), "packages/zod/src/index.ts"),
    ).href;

    const appDir = path.join(tempDir, "src/app");
    fs.mkdirSync(appDir, { recursive: true });

    const routeFile = path.join(appDir, "route.ts");
    fs.writeFileSync(
      routeFile,
      `
      import { z } from "zod";
      import { defineRoute } from ${JSON.stringify(coreIndexUrl)};
      import { zodSchema } from ${JSON.stringify(zodIndexUrl)};

      const ResponseSchema = z.object({
        status: z.string(),
        count: z.number(),
      });

      export const GET = defineRoute(
        {
          response: ResponseSchema,
        },
        ({ response }) => {
          response.json({ status: "ok", count: 42 });
        }
      );

      export const POST = defineRoute(
        {
          response: ResponseSchema,
        },
        ({ response }) => {
          // Invalid response payload (count is string instead of number)
          response.json({ status: "ok", count: "42" as any });
        }
      );
      `,
    );

    const app = createApp({ appDir });
    const { doRequest, close } = await setupTestServer(app);

    try {
      const validRes = await doRequest("GET", "/");
      expect(validRes.status).toBe(200);
      expect(validRes.json()).toEqual({ status: "ok", count: 42 });

      const invalidRes = await doRequest("POST", "/");
      expect(invalidRes.status).toBe(500);
    } finally {
      await close();
    }
  });
});

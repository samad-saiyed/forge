import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { pathToFileURL } from "node:url";
import {
  defineRoute,
  isRouteDefinition,
  loadRouteModule,
  discoverRoutes,
  createApp,
  registerLoadedRoutes,
  Router,
} from "../../packages/core/src";
import type { DiscoveredRouteFile } from "../../packages/core/src/route-scanner.js";

const coreIndexUrl = pathToFileURL(path.resolve("packages/core/src/index.ts")).href;

describe("defineRoute()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kyuu-define-route-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("produces a valid internal route definition with kind: 'route'", () => {
    const handler = async () => {};
    const route = defineRoute({}, handler);

    expect(route).toEqual({
      kind: "route",
      options: {},
      handler,
    });
    expect(isRouteDefinition(route)).toBe(true);
  });

  it("preserves options exactly (validate.params, query, headers, body, response)", () => {
    const paramsSchema = { type: "object", properties: { id: { type: "string" } } };
    const querySchema = { type: "object", properties: { search: { type: "string" } } };
    const headersSchema = { type: "object", properties: { authorization: { type: "string" } } };
    const bodySchema = { type: "object", properties: { name: { type: "string" } } };
    const responseSchema = { type: "object", properties: { ok: { type: "boolean" } } };

    const options = {
      validate: {
        params: paramsSchema,
        query: querySchema,
        headers: headersSchema,
        body: bodySchema,
      },
      response: responseSchema,
    };

    const handler = async () => {};
    const route = defineRoute(options, handler);

    expect(route.options).toBe(options);
    expect(route.options.validate?.params).toBe(paramsSchema);
    expect(route.options.validate?.query).toBe(querySchema);
    expect(route.options.validate?.headers).toBe(headersSchema);
    expect(route.options.validate?.body).toBe(bodySchema);
    expect(route.options.response).toBe(responseSchema);
  });

  it("retains the exact original handler reference", () => {
    const handler = async () => "test-result";
    const route = defineRoute({}, handler);

    expect(route.handler).toBe(handler);
  });

  it("identifies valid vs invalid route definitions via isRouteDefinition", () => {
    const validRoute = defineRoute({}, () => {});
    expect(isRouteDefinition(validRoute)).toBe(true);

    expect(isRouteDefinition(null)).toBe(false);
    expect(isRouteDefinition(undefined)).toBe(false);
    expect(isRouteDefinition("string")).toBe(false);
    expect(isRouteDefinition(123)).toBe(false);
    expect(isRouteDefinition({})).toBe(false);
    expect(isRouteDefinition({ kind: "route" })).toBe(false);
    expect(isRouteDefinition({ kind: "other", handler: () => {} })).toBe(false);
    expect(isRouteDefinition({ kind: "route", handler: "not a function" })).toBe(false);
  });

  it("allows loadRouteModule and registerLoadedRoutes to consume defineRoute exports in filesystem routes", async () => {
    const routeFile = path.join(tempDir, "route.js");
    fs.writeFileSync(
      routeFile,
      `
      import { defineRoute } from ${JSON.stringify(coreIndexUrl)};

      export const GET = defineRoute(
        {
          validate: {
            params: { type: "string" },
          },
        },
        async (req, res) => {
          res.json({ id: req.params.id });
        },
      );
    `,
    );

    const discovered: DiscoveredRouteFile = {
      filePath: routeFile,
      routePath: "/users/:id",
    };

    const loaded = await loadRouteModule(discovered);
    expect(loaded.handlers.has("GET")).toBe(true);
    const getExport = loaded.handlers.get("GET");
    expect(isRouteDefinition(getExport)).toBe(true);

    const router = new Router();
    const app = createApp();
    registerLoadedRoutes(router, [loaded], app);

    const match = router.find("GET", "/users/123");
    expect(match).not.toBeNull();
  });

  it("ensures plain function exports continue to work alongside defineRoute exports", async () => {
    const routeFile = path.join(tempDir, "route.js");
    fs.writeFileSync(
      routeFile,
      `
      import { defineRoute } from ${JSON.stringify(coreIndexUrl)};

      export const GET = async (req, res) => {
        res.json({ ok: true });
      };

      export const POST = defineRoute(
        {},
        async (req, res) => {
          res.json({ created: true });
        },
      );
    `,
    );

    const discovered: DiscoveredRouteFile = {
      filePath: routeFile,
      routePath: "/api/test",
    };

    const loaded = await loadRouteModule(discovered);
    expect(loaded.handlers.size).toBe(2);
    expect(typeof loaded.handlers.get("GET")).toBe("function");
    expect(isRouteDefinition(loaded.handlers.get("POST"))).toBe(true);

    const discoveredRoutes = await discoverRoutes({ root: tempDir });
    expect(discoveredRoutes).toHaveLength(2);
  });
});

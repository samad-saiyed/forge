import type { RouteHandler } from "./application.js";
import type { FileRouteHandler } from "./context.js";
import type { ForgeSchema } from "./schema.js";

export interface RouteOptions<
  Params = unknown,
  Query = unknown,
  Headers = unknown,
  Body = unknown,
  Response = unknown,
> {
  validate?: {
    params?: ForgeSchema<Params> | unknown;
    query?: ForgeSchema<Query> | unknown;
    headers?: ForgeSchema<Headers> | unknown;
    body?: ForgeSchema<Body> | unknown;
  };
  response?: ForgeSchema<Response> | unknown;
}

export interface RouteDefinition<H = RouteHandler | FileRouteHandler> {
  kind: "route";
  options: RouteOptions;
  handler: H;
}

export function defineRoute<H extends RouteHandler | FileRouteHandler>(
  options: RouteOptions,
  handler: H,
): RouteDefinition<H> {
  return {
    kind: "route",
    options,
    handler,
  };
}

export function isRouteDefinition(value: unknown): value is RouteDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).kind === "route" &&
    typeof (value as Record<string, unknown>).handler === "function"
  );
}

import type { Request } from "./request.js";
import { isForgeSchema } from "./schema.js";

export async function executeRouteValidation(
  options: RouteOptions | undefined,
  request: Request,
): Promise<void> {
  const validate = options?.validate;
  if (!validate) {
    return;
  }

  // 1. params
  if (validate.params && isForgeSchema(validate.params)) {
    const result = await validate.params.validate(request.params);
    if (!result.success) {
      throw result.error;
    }
    request.params = result.data as Record<string, string>;
  }

  // 2. query
  if (validate.query && isForgeSchema(validate.query)) {
    const result = await validate.query.validate(request.query);
    if (!result.success) {
      throw result.error;
    }
    request.query = result.data as Record<string, string | string[]>;
  }

  // 3. headers
  if (validate.headers && isForgeSchema(validate.headers)) {
    const result = await validate.headers.validate(request.headers);
    if (!result.success) {
      throw result.error;
    }
    request.headers = result.data as unknown as import("node:http").IncomingHttpHeaders;
  }

  // 4. body
  if (validate.body && isForgeSchema(validate.body)) {
    const rawBody = await request.body;
    const result = await validate.body.validate(rawBody);
    if (!result.success) {
      throw result.error;
    }
    request.body = result.data;
  }
}

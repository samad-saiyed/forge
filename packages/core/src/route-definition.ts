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
import {
  isForgeSchema,
  ForgeValidationError,
  type ValidationIssue,
  type ValidationSource,
  type SchemaIssue,
} from "./schema.js";

function formatValidationIssues(
  source: ValidationSource,
  issues: SchemaIssue[],
): ValidationIssue[] {
  return issues.map((issue) => ({
    source,
    path: issue.path ?? [],
    message: issue.message,
  }));
}

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
      throw new ForgeValidationError(formatValidationIssues("params", result.error.issues));
    }
    request.params = result.data as Record<string, string>;
  }

  // 2. query
  if (validate.query && isForgeSchema(validate.query)) {
    const result = await validate.query.validate(request.query);
    if (!result.success) {
      throw new ForgeValidationError(formatValidationIssues("query", result.error.issues));
    }
    request.query = result.data as Record<string, string | string[]>;
  }

  // 3. headers
  if (validate.headers && isForgeSchema(validate.headers)) {
    const result = await validate.headers.validate(request.headers);
    if (!result.success) {
      throw new ForgeValidationError(formatValidationIssues("headers", result.error.issues));
    }
    request.headers = result.data as unknown as import("node:http").IncomingHttpHeaders;
  }

  // 4. body
  if (validate.body && isForgeSchema(validate.body)) {
    const rawBody = await request.body;
    const result = await validate.body.validate(rawBody);
    if (!result.success) {
      throw new ForgeValidationError(formatValidationIssues("body", result.error.issues));
    }
    request.body = result.data;
  }
}

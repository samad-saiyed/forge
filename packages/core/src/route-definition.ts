import type { IncomingHttpHeaders } from "node:http";
import type { RouteHandler } from "./application.js";
import type { FileRouteHandler } from "./context.js";
import type { InferSchemaOutput } from "./schema.js";

export type ValidateOptions = {
  params?: unknown;
  query?: unknown;
  headers?: unknown;
  body?: unknown;
};

export interface RouteOptions<
  V extends ValidateOptions = ValidateOptions,
  ResponseSchema = unknown,
> {
  validate?: V;
  response?: ResponseSchema;
}

export interface RouteDefinition<
  H = unknown,
  V extends ValidateOptions = ValidateOptions,
  ResponseSchema = unknown,
> {
  kind: "route";
  options: RouteOptions<V, ResponseSchema>;
  handler: H;
}

export type InferValidationTarget<S, Fallback> = [S] extends [never]
  ? Fallback
  : [S] extends [undefined]
    ? Fallback
    : unknown extends S
      ? Fallback
      : InferSchemaOutput<S>;

export type InferValidateParams<V, Fallback = Record<string, string>> = V extends {
  params: infer S;
}
  ? InferValidationTarget<S, Fallback>
  : Fallback;

export type InferValidateQuery<V, Fallback = Record<string, string | string[]>> = V extends {
  query: infer S;
}
  ? InferValidationTarget<S, Fallback>
  : Fallback;

export type InferValidateHeaders<V, Fallback = IncomingHttpHeaders> = V extends { headers: infer S }
  ? InferValidationTarget<S, Fallback>
  : Fallback;

export type InferValidateBody<V, Fallback = unknown> = V extends { body: infer S }
  ? InferValidationTarget<S, Fallback>
  : Fallback;

export type UnifiedRouteHandler<P, Q, B, R, H> =
  RouteHandler<P, Q, B, R, H> | FileRouteHandler<P, Q, B, R, H>;

export function defineRoute<
  V extends ValidateOptions,
  ResSchema = unknown,
  P = InferValidateParams<V>,
  Q = InferValidateQuery<V>,
  B = InferValidateBody<V>,
  H = InferValidateHeaders<V>,
  R = InferSchemaOutput<ResSchema>,
>(
  options: { validate?: V; response?: ResSchema },
  handler: UnifiedRouteHandler<P, Q, B, R, H>,
): RouteDefinition<UnifiedRouteHandler<P, Q, B, R, H>, V, ResSchema> {
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
  isKyuuSchema,
  executeSchemaValidation,
  KyuuValidationError,
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
  if (validate.params && isKyuuSchema(validate.params)) {
    const result = await executeSchemaValidation(validate.params, request.params);
    if (!result.success) {
      throw new KyuuValidationError(formatValidationIssues("params", result.error.issues));
    }
    request.params = result.data as Record<string, string>;
  }

  // 2. query
  if (validate.query && isKyuuSchema(validate.query)) {
    const result = await executeSchemaValidation(validate.query, request.query);
    if (!result.success) {
      throw new KyuuValidationError(formatValidationIssues("query", result.error.issues));
    }
    request.query = result.data as Record<string, string | string[]>;
  }

  // 3. headers
  if (validate.headers && isKyuuSchema(validate.headers)) {
    const result = await executeSchemaValidation(validate.headers, request.headers);
    if (!result.success) {
      throw new KyuuValidationError(formatValidationIssues("headers", result.error.issues));
    }
    request.headers = result.data as unknown as import("node:http").IncomingHttpHeaders;
  }

  // 4. body
  if (validate.body && isKyuuSchema(validate.body)) {
    const rawBody = await request.body;
    const result = await executeSchemaValidation(validate.body, rawBody);
    if (!result.success) {
      throw new KyuuValidationError(formatValidationIssues("body", result.error.issues));
    }
    request.body = result.data;
  }
}

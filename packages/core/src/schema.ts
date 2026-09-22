export interface SchemaIssue {
  path?: (string | number)[];
  message: string;
  code?: string;
}

export interface SchemaValidationError {
  issues: SchemaIssue[];
}

export type ValidationSource = "params" | "query" | "headers" | "body";

export interface ValidationIssue {
  source: ValidationSource;
  path: (string | number)[];
  message: string;
}

export class KyuuValidationError extends Error {
  readonly code = "VALIDATION_ERROR" as const;
  readonly details: ValidationIssue[];

  constructor(details: ValidationIssue[], message = "Request validation failed") {
    super(message);
    this.name = "KyuuValidationError";
    this.details = details;
  }
}

export class ResponseValidationError extends Error {
  readonly code = "RESPONSE_VALIDATION_ERROR" as const;
  readonly issues: SchemaIssue[];

  constructor(message = "Response validation failed", issues: SchemaIssue[] = []) {
    super(message);
    this.name = "ResponseValidationError";
    this.issues = issues;
  }
}

export type SchemaResult<T> =
  { success: true; data: T } | { success: false; error: SchemaValidationError };

export interface KyuuSchema<Output = unknown, Input = unknown> {
  readonly kind: "kyuu-schema";
  validate(input: Input): SchemaResult<Output> | Promise<SchemaResult<Output>>;
}

export function isKyuuSchema(value: unknown): value is KyuuSchema<unknown, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const s = value as Record<string, unknown>;
  return (
    ((s.kind === "kyuu-schema" || s.kind === "kyuu-schema") && typeof s.validate === "function") ||
    typeof s.safeParseAsync === "function" ||
    typeof s.safeParse === "function"
  );
}

export function createSchema<Output = unknown, Input = unknown>(
  validateFn: (input: Input) => SchemaResult<Output> | Promise<SchemaResult<Output>>,
): KyuuSchema<Output, Input> {
  return {
    kind: "kyuu-schema",
    validate: validateFn,
  };
}

export async function executeSchemaValidation(
  schema: unknown,
  input: unknown,
): Promise<SchemaResult<unknown>> {
  if (typeof schema !== "object" || schema === null) {
    return { success: true, data: input };
  }

  const s = schema as Record<string, unknown>;

  if ((s.kind === "kyuu-schema" || s.kind === "kyuu-schema") && typeof s.validate === "function") {
    return await (
      s as unknown as {
        validate: (input: unknown) => SchemaResult<unknown> | Promise<SchemaResult<unknown>>;
      }
    ).validate(input);
  }

  if (typeof s.safeParseAsync === "function") {
    const res = await (
      s as unknown as {
        safeParseAsync: (input: unknown) => Promise<{
          success: boolean;
          data?: unknown;
          error?: {
            issues: Array<{ path?: (string | number)[]; message: string; code?: string }>;
          };
        }>;
      }
    ).safeParseAsync(input);
    if (res.success) {
      return { success: true, data: res.data };
    }
    const issues: SchemaIssue[] = (res.error?.issues ?? []).map((i) => ({
      path: i.path,
      message: i.message,
      code: i.code,
    }));
    return { success: false, error: { issues } };
  }

  if (typeof s.safeParse === "function") {
    const rawRes = (
      s as unknown as {
        safeParse: (input: unknown) =>
          | {
              success: boolean;
              data?: unknown;
              error?: {
                issues: Array<{ path?: (string | number)[]; message: string; code?: string }>;
              };
            }
          | Promise<{
              success: boolean;
              data?: unknown;
              error?: {
                issues: Array<{ path?: (string | number)[]; message: string; code?: string }>;
              };
            }>;
      }
    ).safeParse(input);

    const res = rawRes instanceof Promise ? await rawRes : rawRes;

    if (res.success) {
      return { success: true, data: res.data };
    }
    const issues: SchemaIssue[] = (res.error?.issues ?? []).map((i) => ({
      path: i.path,
      message: i.message,
      code: i.code,
    }));
    return { success: false, error: { issues } };
  }

  if (typeof s.validate === "function") {
    try {
      const rawRes = (
        s as unknown as {
          validate: (input: unknown) => unknown;
        }
      ).validate(input);
      const res = rawRes instanceof Promise ? await rawRes : rawRes;
      if (res && typeof res === "object" && "success" in res) {
        return res as SchemaResult<unknown>;
      }
      return { success: true, data: res };
    } catch (err) {
      const issues: SchemaIssue[] = [];
      const errObj = err as {
        issues?: Array<{ path?: (string | number)[]; message?: string; code?: string }>;
      };
      if (
        errObj &&
        typeof errObj === "object" &&
        "issues" in errObj &&
        Array.isArray(errObj.issues)
      ) {
        for (const i of errObj.issues) {
          issues.push({
            path: i.path ?? [],
            message: i.message ?? "Validation failed",
            code: i.code,
          });
        }
      } else if (err instanceof Error) {
        issues.push({ path: [], message: err.message });
      } else {
        issues.push({ path: [], message: "Validation failed" });
      }
      return { success: false, error: { issues } };
    }
  }

  if (typeof s.parse === "function") {
    try {
      const rawRes = (
        s as unknown as {
          parse: (input: unknown) => unknown;
        }
      ).parse(input);
      const res = rawRes instanceof Promise ? await rawRes : rawRes;
      return { success: true, data: res };
    } catch (err) {
      const issues: SchemaIssue[] = [];
      const errObj = err as {
        issues?: Array<{ path?: (string | number)[]; message?: string; code?: string }>;
      };
      if (
        errObj &&
        typeof errObj === "object" &&
        "issues" in errObj &&
        Array.isArray(errObj.issues)
      ) {
        for (const i of errObj.issues) {
          issues.push({
            path: i.path ?? [],
            message: i.message ?? "Validation failed",
            code: i.code,
          });
        }
      } else if (err instanceof Error) {
        issues.push({ path: [], message: err.message });
      } else {
        issues.push({ path: [], message: "Validation failed" });
      }
      return { success: false, error: { issues } };
    }
  }

  return { success: true, data: input };
}

export type InferSchemaOutput<S> =
  S extends KyuuSchema<infer Output, unknown>
    ? Output
    : S extends { _output: infer Output }
      ? Output
      : S extends {
            safeParseAsync(
              input: unknown,
            ): Promise<{ success: true; data: infer Output } | { success: false; error: unknown }>;
          }
        ? Output
        : S extends {
              safeParse(
                input: unknown,
              ):
                | { success: true; data: infer Output }
                | { success: false; error: unknown }
                | Promise<
                    { success: true; data: infer Output } | { success: false; error: unknown }
                  >;
            }
          ? Output
          : S extends {
                validate(
                  input: unknown,
                ): SchemaResult<infer Output> | Promise<SchemaResult<infer Output>>;
              }
            ? Output
            : S extends { parse(input: unknown): infer Output | Promise<infer Output> }
              ? Awaited<Output>
              : unknown;

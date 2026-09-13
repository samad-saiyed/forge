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

export class ForgeValidationError extends Error {
  readonly code = "VALIDATION_ERROR" as const;
  readonly details: ValidationIssue[];

  constructor(details: ValidationIssue[], message = "Request validation failed") {
    super(message);
    this.name = "ForgeValidationError";
    this.details = details;
  }
}

export type SchemaResult<T> =
  { success: true; data: T } | { success: false; error: SchemaValidationError };

export interface ForgeSchema<Output = unknown, Input = unknown> {
  readonly kind: "forge-schema";
  validate(input: Input): SchemaResult<Output> | Promise<SchemaResult<Output>>;
}

export function isForgeSchema(value: unknown): value is ForgeSchema<unknown, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const s = value as Record<string, unknown>;
  return (
    (s.kind === "forge-schema" && typeof s.validate === "function") ||
    typeof s.safeParseAsync === "function" ||
    typeof s.safeParse === "function"
  );
}

export function createSchema<Output = unknown, Input = unknown>(
  validateFn: (input: Input) => SchemaResult<Output> | Promise<SchemaResult<Output>>,
): ForgeSchema<Output, Input> {
  return {
    kind: "forge-schema",
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

  if (s.kind === "forge-schema" && typeof s.validate === "function") {
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
      path: i.path ?? [],
      message: i.message,
      code: i.code,
    }));
    return { success: false, error: { issues } };
  }

  if (typeof s.safeParse === "function") {
    const res = await (
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
    if (res.success) {
      return { success: true, data: res.data };
    }
    const issues: SchemaIssue[] = (res.error?.issues ?? []).map((i) => ({
      path: i.path ?? [],
      message: i.message,
      code: i.code,
    }));
    return { success: false, error: { issues } };
  }

  if (typeof s.validate === "function") {
    return await (
      s as unknown as {
        validate: (input: unknown) => SchemaResult<unknown> | Promise<SchemaResult<unknown>>;
      }
    ).validate(input);
  }

  if (typeof s.parseAsync === "function" || typeof s.parse === "function") {
    try {
      const data =
        typeof s.parseAsync === "function"
          ? await (s as unknown as { parseAsync: (i: unknown) => Promise<unknown> }).parseAsync(
              input,
            )
          : (s as unknown as { parse: (i: unknown) => unknown }).parse(input);
      return { success: true, data };
    } catch (err: unknown) {
      const e = err as {
        issues?: Array<{ path?: (string | number)[]; message: string; code?: string }>;
        message?: string;
      };
      const issues: SchemaIssue[] = (e?.issues ?? []).map((i) => ({
        path: i.path ?? [],
        message: i.message,
        code: i.code,
      }));
      if (issues.length === 0) {
        issues.push({ path: [], message: e.message ?? "Validation failed" });
      }
      return { success: false, error: { issues } };
    }
  }

  return { success: true, data: input };
}

export type InferSchemaOutput<S> =
  S extends ForgeSchema<infer Output, unknown>
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

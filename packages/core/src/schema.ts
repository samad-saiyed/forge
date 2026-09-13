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
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).kind === "forge-schema" &&
    typeof (value as Record<string, unknown>).validate === "function"
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

export type InferSchemaOutput<S> =
  S extends ForgeSchema<infer Output, unknown>
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

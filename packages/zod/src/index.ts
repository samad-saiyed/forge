import type { KyuuSchema, SchemaIssue, SchemaValidationError } from "@kyuujs/core";
import type { z, ZodError, ZodTypeAny } from "zod";

export function formatZodError(error: ZodError): SchemaValidationError {
  const issues: SchemaIssue[] = error.issues.map((issue) => ({
    path: issue.path.map((p) => p),
    message: issue.message,
    code: issue.code,
  }));
  return { issues };
}

export function zodSchema<T extends ZodTypeAny>(schema: T): KyuuSchema<z.output<T>, z.input<T>> {
  return {
    kind: "kyuu-schema",
    validate(input: z.input<T>) {
      const result = schema.safeParse(input);
      if (result.success) {
        return { success: true, data: result.data };
      }
      return { success: false, error: formatZodError(result.error) };
    },
  };
}

export default zodSchema;

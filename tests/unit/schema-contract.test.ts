import { describe, expect, it } from "vitest";
import {
  createSchema,
  defineRoute,
  isKyuuSchema,
  type KyuuSchema,
  type InferSchemaOutput,
  type SchemaResult,
} from "../../packages/core/src/index.js";

describe("Schema Adapter Contract", () => {
  it("validates successful inputs without external schema dependencies", async () => {
    interface User {
      name: string;
      age: number;
    }

    const userSchema: KyuuSchema<User> = createSchema<User>(
      (input: unknown): SchemaResult<User> => {
        type InferredUser = InferSchemaOutput<typeof userSchema>;
        const _check: InferredUser = { name: "test", age: 1 };
        void _check;
        if (
          typeof input === "object" &&
          input !== null &&
          "name" in input &&
          typeof (input as Record<string, unknown>).name === "string" &&
          "age" in input &&
          typeof (input as Record<string, unknown>).age === "number"
        ) {
          return {
            success: true,
            data: {
              name: (input as { name: string }).name,
              age: (input as { age: number }).age,
            },
          };
        }
        return {
          success: false,
          error: {
            issues: [{ message: "Expected object with name and age" }],
          },
        };
      },
    );

    const result = await userSchema.validate({ name: "Samad", age: 30 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Samad", age: 30 });
    }
  });

  it("supports value transformation (e.g., coercion from string to number)", async () => {
    const ageSchema = createSchema<number, unknown>((input: unknown): SchemaResult<number> => {
      const num = Number(input);
      if (!isNaN(num)) {
        return {
          success: true,
          data: num,
        };
      }
      return {
        success: false,
        error: {
          issues: [{ path: ["age"], message: "Invalid number format", code: "invalid_type" }],
        },
      };
    });

    const result = await ageSchema.validate("25");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(25);
    }
  });

  it("returns structured validation failures with path, message, and code", async () => {
    const emailSchema = createSchema<string>((input: unknown): SchemaResult<string> => {
      if (typeof input !== "string" || !input.includes("@")) {
        return {
          success: false,
          error: {
            issues: [
              {
                path: ["body", "email"],
                message: "Invalid email address",
                code: "invalid_string",
              },
            ],
          },
        };
      }
      return { success: true, data: input };
    });

    const result = await emailSchema.validate("invalid-email");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]).toEqual({
        path: ["body", "email"],
        message: "Invalid email address",
        code: "invalid_string",
      });
    }
  });

  it("handles asynchronous validation gracefully", async () => {
    const asyncSchema = createSchema<string>(
      async (input: unknown): Promise<SchemaResult<string>> => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (input === "valid-async-token") {
          return { success: true, data: "valid-async-token" };
        }
        return {
          success: false,
          error: {
            issues: [
              {
                path: ["headers", "authorization"],
                message: "Token expired",
                code: "unauthorized",
              },
            ],
          },
        };
      },
    );

    const validResult = await asyncSchema.validate("valid-async-token");
    expect(validResult.success).toBe(true);

    const invalidResult = await asyncSchema.validate("expired-token");
    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.error.issues[0].message).toBe("Token expired");
    }
  });

  it("reliably detects Kyuu-compatible schemas using isKyuuSchema", () => {
    const validSchema = createSchema((input) => ({ success: true, data: input }));
    expect(isKyuuSchema(validSchema)).toBe(true);

    expect(isKyuuSchema(null)).toBe(false);
    expect(isKyuuSchema(undefined)).toBe(false);
    expect(isKyuuSchema("string")).toBe(false);
    expect(isKyuuSchema(123)).toBe(false);
    expect(isKyuuSchema({})).toBe(false);
    expect(isKyuuSchema({ kind: "other", validate: () => {} })).toBe(false);
    expect(isKyuuSchema({ kind: "kyuu-schema" })).toBe(false);
    expect(isKyuuSchema({ kind: "kyuu-schema", validate: "not a function" })).toBe(false);
    expect(isKyuuSchema({ parse: () => {} })).toBe(false);
  });

  it("allows defineRoute options to carry KyuuSchema instances without changing route handler behavior", () => {
    const bodySchema = createSchema<{ title: string }>((input) => ({
      success: true,
      data: input as { title: string },
    }));

    const route = defineRoute(
      {
        validate: {
          body: bodySchema,
        },
      },
      (req, res) => {
        void req;
        void res;
      },
    );

    expect(route.options.validate?.body).toBe(bodySchema);
    expect(isKyuuSchema(route.options.validate?.body)).toBe(true);
  });
});

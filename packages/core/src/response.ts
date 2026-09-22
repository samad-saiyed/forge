import type { ServerResponse } from "node:http";
import { ResponseValidationError } from "./schema.js";

export class Response<ResBody = unknown> {
  private isEnded = false;
  private responseSchema?: unknown;

  constructor(public readonly raw: ServerResponse) {}

  setResponseSchema(schema: unknown): this {
    this.responseSchema = schema;
    return this;
  }

  status(code: number): this {
    if (this.isEnded || this.raw.headersSent) {
      return this;
    }
    this.raw.statusCode = code;
    return this;
  }

  set(
    field: string | Record<string, string | number | string[]>,
    value?: string | number | string[],
  ): this {
    if (this.isEnded || this.raw.headersSent) {
      return this;
    }
    if (typeof field === "object" && field !== null) {
      for (const [key, val] of Object.entries(field)) {
        this.set(key, val);
      }
    } else if (typeof field === "string") {
      if (value !== undefined) {
        this.raw.setHeader(field, value);
      }
    }
    return this;
  }

  header(
    field: string | Record<string, string | number | string[]>,
    value?: string | number | string[],
  ): this {
    return this.set(field, value);
  }

  setHeader(
    field: string | Record<string, string | number | string[]>,
    value?: string | number | string[],
  ): this {
    return this.set(field, value);
  }

  private validateResponseBody(body: unknown): void {
    if (!this.responseSchema) {
      return;
    }

    const schema = this.responseSchema as Record<string, unknown>;

    if (typeof schema.safeParse === "function") {
      const res = (
        schema as {
          safeParse: (b: unknown) =>
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
      ).safeParse(body);

      if ("then" in res && typeof (res as Promise<unknown>).then === "function") {
        (
          res as Promise<{
            success: boolean;
            error?: {
              issues: Array<{ path?: (string | number)[]; message: string; code?: string }>;
            };
          }>
        ).then((r) => {
          if (!r.success) {
            const issues = (r.error?.issues ?? []).map((i) => ({
              path: i.path ?? [],
              message: i.message,
              code: i.code,
            }));
            throw new ResponseValidationError(
              `Response validation failed: ${issues.map((i) => i.message).join(", ")}`,
              issues,
            );
          }
        });
        return;
      }

      if (!(res as { success: boolean }).success) {
        const issues = (
          (
            res as {
              error?: {
                issues: Array<{ path?: (string | number)[]; message: string; code?: string }>;
              };
            }
          ).error?.issues ?? []
        ).map((i) => ({
          path: i.path ?? [],
          message: i.message,
          code: i.code,
        }));
        throw new ResponseValidationError(
          `Response validation failed: ${issues.map((i) => i.message).join(", ")}`,
          issues,
        );
      }
      return;
    }

    if (
      (schema.kind === "kyuu-schema" || schema.kind === "kyuu-schema") &&
      typeof schema.validate === "function"
    ) {
      const res = (
        schema as {
          validate: (b: unknown) =>
            | {
                success: boolean;
                error: {
                  issues: Array<{ path?: (string | number)[]; message: string; code?: string }>;
                };
              }
            | Promise<{
                success: boolean;
                error: {
                  issues: Array<{ path?: (string | number)[]; message: string; code?: string }>;
                };
              }>;
        }
      ).validate(body);

      if ("then" in res && typeof (res as Promise<unknown>).then === "function") {
        (
          res as Promise<{
            success: boolean;
            error: {
              issues: Array<{ path?: (string | number)[]; message: string; code?: string }>;
            };
          }>
        ).then((r) => {
          if (!r.success) {
            throw new ResponseValidationError(
              `Response validation failed: ${r.error.issues.map((i) => i.message).join(", ")}`,
              r.error.issues,
            );
          }
        });
        return;
      }

      if (!(res as { success: boolean }).success) {
        const errRes = res as {
          success: false;
          error: {
            issues: Array<{ path?: (string | number)[]; message: string; code?: string }>;
          };
        };
        throw new ResponseValidationError(
          `Response validation failed: ${errRes.error.issues.map((i) => i.message).join(", ")}`,
          errRes.error.issues,
        );
      }
      return;
    }

    if (typeof schema.safeParseAsync === "function") {
      (
        schema as {
          safeParseAsync: (b: unknown) => Promise<{
            success: boolean;
            error?: {
              issues: Array<{ path?: (string | number)[]; message: string; code?: string }>;
            };
          }>;
        }
      )
        .safeParseAsync(body)
        .then((r) => {
          if (!r.success) {
            const issues = (r.error?.issues ?? []).map((i) => ({
              path: i.path ?? [],
              message: i.message,
              code: i.code,
            }));
            throw new ResponseValidationError(
              `Response validation failed: ${issues.map((i) => i.message).join(", ")}`,
              issues,
            );
          }
        });
      return;
    }
  }

  json(body: ResBody): this {
    if (this.isEnded || this.raw.headersSent) {
      throw new Error("Cannot send response after headers are sent or response is ended");
    }

    if (this.responseSchema && (!this.raw.statusCode || this.raw.statusCode < 400)) {
      this.validateResponseBody(body);
    }

    if (!this.raw.getHeader("content-type")) {
      this.raw.setHeader("content-type", "application/json; charset=utf-8");
    }

    const payload = JSON.stringify(body);
    return this.end(payload);
  }

  send(body?: string | Buffer | object | null | number | boolean): this {
    if (this.isEnded || this.raw.headersSent) {
      throw new Error("Cannot send response after headers are sent or response is ended");
    }

    if (body === null || body === undefined) {
      return this.end();
    }

    if (Buffer.isBuffer(body)) {
      if (!this.raw.getHeader("content-type")) {
        this.raw.setHeader("content-type", "application/octet-stream");
      }
      return this.end(body);
    }

    if (typeof body === "string") {
      if (!this.raw.getHeader("content-type")) {
        this.raw.setHeader("content-type", "text/html; charset=utf-8");
      }
      return this.end(body);
    }

    if (typeof body === "object" || typeof body === "number" || typeof body === "boolean") {
      return this.json(body as ResBody);
    }

    return this.end();
  }

  end(data?: string | Buffer): this {
    if (this.isEnded || this.raw.headersSent) {
      throw new Error("Cannot send response after headers are sent or response is ended");
    }

    this.isEnded = true;
    this.raw.end(data as never);
    return this;
  }
}

export type KyuuResponse<ResBody = unknown> = Response<ResBody>;

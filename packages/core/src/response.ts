import type { ServerResponse } from "node:http";

export class Response<ResBody = unknown> {
  private isEnded = false;

  constructor(public readonly raw: ServerResponse) {}

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

  json(body: ResBody): this {
    if (this.isEnded || this.raw.headersSent) {
      throw new Error("Cannot send response after headers are sent or response is ended");
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

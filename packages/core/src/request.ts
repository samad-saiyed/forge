import type { IncomingHttpHeaders, IncomingMessage } from "node:http";

export class Request {
  public params: Record<string, string> = {};
  // public body: unknown = undefined;
  private parsedQuery?: Record<string, string | string[]>;

  private bodyPromise?: Promise<Buffer>;
  private parsedBody?: Buffer;

  constructor(public readonly raw: IncomingMessage) {}

  get method(): string {
    return this.raw.method ?? "GET";
  }

  get url(): string {
    return this.raw.url ?? "/";
  }

  get headers(): IncomingHttpHeaders {
    return this.raw.headers;
  }

  get query(): Record<string, string | string[]> {
    if (!this.parsedQuery) {
      const urlString = this.url;
      const queryIndex = urlString.indexOf("?");
      if (queryIndex === -1) {
        this.parsedQuery = {};
      } else {
        const searchParams = new URLSearchParams(urlString.slice(queryIndex + 1));
        const queryObj: Record<string, string | string[]> = {};
        for (const [key, value] of searchParams.entries()) {
          const existing = queryObj[key];
          if (existing === undefined) {
            queryObj[key] = value;
          } else if (Array.isArray(existing)) {
            existing.push(value);
          } else {
            queryObj[key] = [existing, value];
          }
        }
        this.parsedQuery = queryObj;
      }
    }
    return this.parsedQuery;
  }

  async readBody(): Promise<Buffer> {
    if (this.parsedBody) {
      return this.parsedBody;
    }

    if (!this.bodyPromise) {
      this.bodyPromise = new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];

        this.raw.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        this.raw.once("end", () => {
          this.parsedBody = Buffer.concat(chunks);
          resolve(this.parsedBody);
        });

        this.raw.once("error", reject);
      });
    }

    return this.bodyPromise;
  }

  async parseBody<T = unknown>(): Promise<T | undefined> {
    const body = await this.readBody();

    if (body.length === 0) {
      return undefined;
    }

    const contentType = this.header("content-type");

    if ((contentType as string)?.split(";", 1)[0].trim().toLowerCase() === "application/json") {
      return JSON.parse(body.toString("utf8")) as T;
    }

    return body as T;
  }

  header(name: string): string | string[] | undefined {
    return this.raw.headers[name.toLowerCase()];
  }
}

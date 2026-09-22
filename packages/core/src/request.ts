import type { IncomingHttpHeaders, IncomingMessage } from "node:http";

export class Request<
  Params = Record<string, string>,
  Query = Record<string, string | string[]>,
  Body = unknown,
  Headers = IncomingHttpHeaders,
> {
  public params: Params;
  // public body: unknown = undefined;
  private parsedQuery?: Query;

  private rawBody?: Buffer;
  private rawBodyPromise?: Promise<Buffer>;

  private parsedBody?: Body;
  private bodyPromise?: Promise<Body>;

  constructor(
    public readonly raw: IncomingMessage,
    params?: Params,
  ) {
    this.params = params ?? ({} as Params);
  }

  get body(): Promise<Body> {
    if (this.parsedBody !== undefined) {
      return Promise.resolve(this.parsedBody);
    }

    if (!this.bodyPromise) {
      this.bodyPromise = this.parseBody<Body>() as Promise<Body>;
    }

    return this.bodyPromise;
  }

  set body(val: unknown) {
    this.parsedBody = val as Body;
  }

  get method(): string {
    return this.raw.method ?? "GET";
  }

  get url(): string {
    return this.raw.url ?? "/";
  }

  private customHeaders?: IncomingHttpHeaders;

  get headers(): Headers {
    return (this.customHeaders ?? this.raw.headers) as unknown as Headers;
  }

  set headers(val: Headers) {
    this.customHeaders = val as unknown as IncomingHttpHeaders;
  }

  get query(): Query {
    if (!this.parsedQuery) {
      const urlString = this.url;
      const queryIndex = urlString.indexOf("?");
      if (queryIndex === -1) {
        this.parsedQuery = {} as Query;
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
        this.parsedQuery = queryObj as unknown as Query;
      }
    }
    return this.parsedQuery;
  }

  set query(val: Query) {
    this.parsedQuery = val;
  }

  async readBody(): Promise<Buffer> {
    if (this.rawBody) {
      return this.rawBody;
    }

    if (!this.rawBodyPromise) {
      this.rawBodyPromise = new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];

        this.raw.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        this.raw.once("end", () => {
          this.rawBody = Buffer.concat(chunks);
          resolve(this.rawBody);
        });

        this.raw.once("error", reject);
      });
    }

    return this.rawBodyPromise;
  }

  async parseBody<T = Body>(): Promise<T | undefined> {
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

export type KyuuRequest<
  Params = Record<string, string>,
  Query = Record<string, string | string[]>,
  Body = unknown,
  Headers = IncomingHttpHeaders,
> = Request<Params, Query, Body, Headers>;

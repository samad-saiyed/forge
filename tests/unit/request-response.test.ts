import { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { Request, Response } from "../../packages/core/src/index.js";

describe("Request", () => {
  it("should retain the underlying request", () => {
    const raw = new IncomingMessage(null as never);
    const request = new Request(raw);

    expect(request.raw).toBe(raw);
  });

  it("should provide access to method, url, headers, params, and query", () => {
    const raw = {
      method: "GET",
      url: "/users?search=test&sort=asc",
      headers: { "content-type": "application/json" },
    } as unknown as IncomingMessage;

    const request = new Request(raw);

    expect(request.method).toBe("GET");
    expect(request.url).toBe("/users?search=test&sort=asc");
    expect(request.headers).toEqual({ "content-type": "application/json" });
    expect(request.params).toEqual({});
    expect(request.query).toEqual({ search: "test", sort: "asc" });
    expect(request.header("content-type")).toBe("application/json");
  });

  it("parses single, multiple, repeated, and empty query parameters correctly", () => {
    const emptyReq = new Request({ url: "/users" } as IncomingMessage);
    expect(emptyReq.query).toEqual({});

    const singleReq = new Request({ url: "/users?page=2" } as IncomingMessage);
    expect(singleReq.query).toEqual({ page: "2" });

    const multiReq = new Request({ url: "/users?page=2&search=test" } as IncomingMessage);
    expect(multiReq.query).toEqual({ page: "2", search: "test" });

    const repeatedReq = new Request({ url: "/users?tag=a&tag=b" } as IncomingMessage);
    expect(repeatedReq.query).toEqual({ tag: ["a", "b"] });
  });

  it("parses JSON object, JSON array, empty body, and non-JSON body correctly", async () => {
    const createMockReq = (headers: Record<string, string>, bodyContent?: string | Buffer) => {
      const listeners = new Map<string, (...args: unknown[]) => void>();
      const on = (event: string, fn: (...args: unknown[]) => void) => {
        listeners.set(event, fn);
        if (event === "data" && bodyContent !== undefined) {
          fn(Buffer.isBuffer(bodyContent) ? bodyContent : Buffer.from(bodyContent));
        }
        if (event === "end") {
          fn();
        }
      };
      const raw = {
        headers,
        on,
        once(event: string, fn: (...args: unknown[]) => void) {
          on(event, fn);
        },
      } as unknown as IncomingMessage;
      return new Request(raw);
    };

    const jsonObjReq = createMockReq(
      { "content-type": "application/json" },
      JSON.stringify({ name: "Alice", email: "alice@example.com" }),
    );
    expect(await jsonObjReq.body).toEqual({ name: "Alice", email: "alice@example.com" });

    const jsonArrReq = createMockReq(
      { "content-type": "application/json" },
      JSON.stringify([{ id: 1 }, { id: 2 }]),
    );
    expect(await jsonArrReq.body).toEqual([{ id: 1 }, { id: 2 }]);

    const emptyBodyReq = createMockReq({ "content-type": "application/json" }, "");
    expect(await emptyBodyReq.body).toBeUndefined();

    const plainTextReq = createMockReq({ "content-type": "text/plain" }, "Hello world");
    const plainBody = await plainTextReq.body;
    expect(Buffer.isBuffer(plainBody)).toBe(true);
    expect((plainBody as unknown as Buffer).toString("utf8")).toBe("Hello world");
  });
});

describe("Response", () => {
  it("should retain the underlying response", () => {
    const raw = new ServerResponse(new IncomingMessage(null as never));
    const response = new Response(raw);

    expect(response.raw).toBe(raw);
  });

  it("should support setting status, headers, and chaining", () => {
    const raw = new ServerResponse(new IncomingMessage(null as never));
    const response = new Response(raw);

    expect(response.status(201)).toBe(response);
    expect(raw.statusCode).toBe(201);

    expect(response.set("x-custom-header", "foo")).toBe(response);
    expect(raw.getHeader("x-custom-header")).toBe("foo");

    expect(response.header("x-another-header", "bar")).toBe(response);
    expect(raw.getHeader("x-another-header")).toBe("bar");
  });

  it("should send json responses with correct content-type header", () => {
    const raw = new ServerResponse(new IncomingMessage(null as never));
    const response = new Response(raw);

    response.json({ message: "hello" });

    expect(raw.getHeader("content-type")).toBe("application/json; charset=utf-8");
    expect(raw.writableEnded).toBe(true);
  });

  it("should send string responses with default content-type header", () => {
    const raw = new ServerResponse(new IncomingMessage(null as never));
    const response = new Response(raw);

    response.send("Hello World");

    expect(raw.getHeader("content-type")).toBe("text/html; charset=utf-8");
    expect(raw.writableEnded).toBe(true);
  });

  it("should throw or prevent sending multiple responses", () => {
    const raw = new ServerResponse(new IncomingMessage(null as never));
    const response = new Response(raw);

    response.send("First response");

    expect(() => response.send("Second response")).toThrow(
      "Cannot send response after headers are sent or response is ended",
    );
  });

  it("supports status(code).json(payload) chaining and status(204).end()", () => {
    const raw1 = new ServerResponse(new IncomingMessage(null as never));
    const res1 = new Response<{ id: string; name: string }>(raw1);

    res1.status(201).json({ id: "1", name: "Alice" });

    expect(raw1.statusCode).toBe(201);
    expect(raw1.getHeader("content-type")).toBe("application/json; charset=utf-8");
    expect(raw1.writableEnded).toBe(true);

    const raw2 = new ServerResponse(new IncomingMessage(null as never));
    const res2 = new Response<{ id: string }>(raw2);

    res2.status(204).end();

    expect(raw2.statusCode).toBe(204);
    expect(raw2.writableEnded).toBe(true);
  });
});

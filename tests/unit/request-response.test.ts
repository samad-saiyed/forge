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
});

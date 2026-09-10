import { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { Request, Response } from "../../packages/core/src/index.js";

describe("Request", () => {
  it("should retain the underlying request", () => {
    const raw = new IncomingMessage(null);
    const request = new Request(raw);

    expect(request.raw).toBe(raw);
  });
});

describe("Response", () => {
  it("should retain the underlying response", () => {
    const raw = new ServerResponse(new IncomingMessage(null));
    const response = new Response(raw);

    expect(response.raw).toBe(raw);
  });
});

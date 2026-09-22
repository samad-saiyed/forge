import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createApp, type ErrorMiddleware } from "../../packages/core/src/index.js";
import { Request } from "../../packages/core/src/request.js";
import { Response } from "../../packages/core/src/response.js";

type InternalApp = { handleRequest: (req: Request, res: Response) => Promise<void> };

describe("Request/Response API Hardening", () => {
  describe("Request API", () => {
    it("should accurately expose method, url, headers, and case-insensitive header lookup", () => {
      const mockRaw = {
        method: "POST",
        url: "/api/users?ref=test",
        headers: {
          "content-type": "application/json",
          "x-custom-header": "custom-value",
        },
      };

      const req = new Request(mockRaw as never);

      expect(req.method).toBe("POST");
      expect(req.url).toBe("/api/users?ref=test");
      expect(req.headers).toEqual(mockRaw.headers);
      expect(req.header("content-type")).toBe("application/json");
      expect(req.header("CONTENT-TYPE")).toBe("application/json");
      expect(req.header("X-Custom-Header")).toBe("custom-value");
      expect(req.header("non-existent")).toBeUndefined();
    });

    it("should handle query parameters: single, repeated, encoded, and malformed encoded values", () => {
      // 1. Single & repeated & encoded query values
      const req1 = new Request({
        method: "GET",
        url: "/search?q=hello%20world&tag=ts&tag=js&special=%26%3D",
      } as never);

      expect(req1.query).toEqual({
        q: "hello world",
        tag: ["ts", "js"],
        special: "&=",
      });

      // 2. Malformed percent-encoded query value
      const req2 = new Request({
        method: "GET",
        url: "/search?bad=%E0%A4%A&normal=ok",
      } as never);

      expect(() => req2.query).not.toThrow();
      expect(req2.query.normal).toBe("ok");
      expect(req2.query.bad).toBeDefined();
    });

    it("should read raw body as Buffer via readBody()", async () => {
      const emitter = new EventEmitter() as never;
      const req = new Request(emitter);

      const readPromise = req.readBody();

      (emitter as EventEmitter).emit("data", Buffer.from("hello "));
      (emitter as EventEmitter).emit("data", Buffer.from("world"));
      (emitter as EventEmitter).emit("end");

      const bodyBuffer = await readPromise;
      expect(Buffer.isBuffer(bodyBuffer)).toBe(true);
      expect(bodyBuffer.toString("utf8")).toBe("hello world");

      // Subsequent readBody calls return cached Buffer
      const cached = await req.readBody();
      expect(cached).toBe(bodyBuffer);
    });

    it("should parse valid JSON body and throw/reject on invalid JSON body", async () => {
      // Valid JSON
      const validEmitter = new EventEmitter() as never;
      const validReq = new Request(validEmitter);
      (validReq.raw as unknown as { headers: Record<string, string> }).headers = {
        "content-type": "application/json; charset=utf-8",
      };

      const validParsePromise = validReq.parseBody();
      (validEmitter as EventEmitter).emit("data", Buffer.from(JSON.stringify({ name: "Kyuu" })));
      (validEmitter as EventEmitter).emit("end");

      const validParsed = await validParsePromise;
      expect(validParsed).toEqual({ name: "Kyuu" });

      // Invalid JSON
      const invalidEmitter = new EventEmitter() as never;
      const invalidReq = new Request(invalidEmitter);
      (invalidReq.raw as unknown as { headers: Record<string, string> }).headers = {
        "content-type": "application/json",
      };

      const invalidParsePromise = invalidReq.parseBody();
      (invalidEmitter as EventEmitter).emit("data", Buffer.from("{ invalid-json: }"));
      (invalidEmitter as EventEmitter).emit("end");

      await expect(invalidParsePromise).rejects.toThrow(SyntaxError);
    });

    it("should cache parsed body via req.body getter", async () => {
      const emitter = new EventEmitter() as never;
      const req = new Request(emitter);
      (req.raw as unknown as { headers: Record<string, string> }).headers = {
        "content-type": "application/json",
      };

      const bodyPromise1 = req.body;
      const bodyPromise2 = req.body;
      expect(bodyPromise1).toBe(bodyPromise2);

      (emitter as EventEmitter).emit("data", Buffer.from(JSON.stringify({ cached: true })));
      (emitter as EventEmitter).emit("end");

      const result = await bodyPromise1;
      expect(result).toEqual({ cached: true });
    });
  });

  describe("Response API", () => {
    it("should support chainable status(), set(), header(), setHeader(), json(), send(), end()", () => {
      const setHeaderFn = vi.fn();
      const resMock = {
        statusCode: 200,
        headersSent: false,
        setHeader: setHeaderFn,
        getHeader: vi.fn(),
        end: vi.fn(),
      };
      const res = new Response(resMock as never);

      res
        .status(201)
        .set("X-One", "1")
        .header("X-Two", "2")
        .setHeader("X-Three", "3")
        .set({ "X-Four": "4", "X-Five": "5" });

      expect(resMock.statusCode).toBe(201);
      expect(setHeaderFn).toHaveBeenCalledWith("X-One", "1");
      expect(setHeaderFn).toHaveBeenCalledWith("X-Two", "2");
      expect(setHeaderFn).toHaveBeenCalledWith("X-Three", "3");
      expect(setHeaderFn).toHaveBeenCalledWith("X-Four", "4");
      expect(setHeaderFn).toHaveBeenCalledWith("X-Five", "5");
    });

    it("should throw error when calling send(), json(), or end() twice", () => {
      const resMock = {
        statusCode: 200,
        headersSent: false,
        setHeader: vi.fn(),
        getHeader: vi.fn(),
        end: vi.fn(),
      };
      const res = new Response(resMock as never);

      res.send("first");
      expect(() => res.send("second")).toThrow(
        "Cannot send response after headers are sent or response is ended",
      );
      expect(() => res.json({ second: true })).toThrow(
        "Cannot send response after headers are sent or response is ended",
      );
      expect(() => res.end("third")).toThrow(
        "Cannot send response after headers are sent or response is ended",
      );
    });

    it("should ignore status() and set()/setHeader() calls after response completion", () => {
      const setHeaderFn = vi.fn();
      const resMock = {
        statusCode: 200,
        headersSent: false,
        setHeader: setHeaderFn,
        getHeader: vi.fn(),
        end: vi.fn(() => {
          resMock.headersSent = true;
        }),
      };
      const res = new Response(resMock as never);

      res.status(200).json({ ok: true });

      // Post-completion modifications should be ignored safely
      res.status(500);
      res.set("X-Late", "no");
      res.header("X-Late-2", "no");
      res.setHeader("X-Late-3", "no");

      expect(resMock.statusCode).toBe(200);
      expect(setHeaderFn).not.toHaveBeenCalledWith("X-Late", "no");
      expect(setHeaderFn).not.toHaveBeenCalledWith("X-Late-2", "no");
      expect(setHeaderFn).not.toHaveBeenCalledWith("X-Late-3", "no");
    });
  });

  describe("Middleware & Pipeline Integration", () => {
    it("should pass invalid JSON body parse error through middleware pipeline to error middleware", async () => {
      const app = createApp();
      const logs: string[] = [];

      app.post("/submit", async (req, res) => {
        const body = await req.body;
        res.json({ body });
      });

      const errMw: ErrorMiddleware = (err, _req, res, _next) => {
        void _next;
        logs.push(`errMw caught: ${(err as Error).name}`);
        res.status(400).json({ error: "Invalid JSON Payload" });
      };
      app.use(errMw);

      const emitter = new EventEmitter();
      (
        emitter as unknown as { method: string; url: string; headers: Record<string, string> }
      ).method = "POST";
      (emitter as unknown as { method: string; url: string; headers: Record<string, string> }).url =
        "/submit";
      (
        emitter as unknown as { method: string; url: string; headers: Record<string, string> }
      ).headers = {
        "content-type": "application/json",
      };

      const req = new Request(emitter as never);
      let endData = "";
      const resMock = {
        statusCode: 200,
        headersSent: false,
        setHeader: vi.fn(),
        getHeader: vi.fn(),
        end: vi.fn((data) => {
          endData = data;
        }),
      };
      const res = new Response(resMock as never);

      const handlePromise = (app as unknown as InternalApp).handleRequest(req, res);
      emitter.emit("data", Buffer.from("{ invalid json }"));
      emitter.emit("end");

      await handlePromise;

      expect(logs).toEqual(["errMw caught: SyntaxError"]);
      expect(resMock.statusCode).toBe(400);
      expect(JSON.parse(endData)).toEqual({ error: "Invalid JSON Payload" });
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../packages/core/src/index.js";
import { Request } from "../../packages/core/src/request.js";
import { Response } from "../../packages/core/src/response.js";

type InternalApp = { handleRequest: (req: Request, res: Response) => Promise<void> };

describe("Error Handling", () => {
  it("should catch synchronous errors in handlers and respond with 500", async () => {
    const app = createApp();
    app.get("/sync-error", () => {
      throw new Error("Sync handler error");
    });

    const req = new Request({ method: "GET", url: "/sync-error" } as never);
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn(),
    };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(resMock.statusCode).toBe(500);
    expect(resMock.end).toHaveBeenCalled();
  });

  it("should catch asynchronous errors in handlers and respond with 500", async () => {
    const app = createApp();
    app.get("/async-error", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error("Async handler error");
    });

    const req = new Request({ method: "GET", url: "/async-error" } as never);
    const resMock = {
      statusCode: 200,
      headersSent: false,
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      end: vi.fn(),
    };
    const res = new Response(resMock as never);

    await (app as unknown as InternalApp).handleRequest(req, res);

    expect(resMock.statusCode).toBe(500);
    expect(resMock.end).toHaveBeenCalled();
  });

  it("should return production error message without leaking sensitive details when NODE_ENV is production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const app = createApp();
      app.get("/prod-error", () => {
        throw new Error("Sensitive DB Password Leaked!");
      });

      const req = new Request({ method: "GET", url: "/prod-error" } as never);
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

      await (app as unknown as InternalApp).handleRequest(req, res);

      expect(resMock.statusCode).toBe(500);
      expect(endData).not.toContain("Sensitive DB Password Leaked!");
      expect(JSON.parse(endData)).toEqual({ error: "Internal Server Error" });
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("should include error message in development mode", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    try {
      const app = createApp();
      app.get("/dev-error", () => {
        throw new Error("Dev details");
      });

      const req = new Request({ method: "GET", url: "/dev-error" } as never);
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

      await (app as unknown as InternalApp).handleRequest(req, res);

      expect(resMock.statusCode).toBe(500);
      expect(JSON.parse(endData)).toEqual({
        error: "Internal Server Error",
        message: "Dev details",
      });
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

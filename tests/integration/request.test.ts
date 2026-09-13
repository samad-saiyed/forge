import { createServer, request as httpRequest } from "node:http";
import { describe, expect, it } from "vitest";
import { Request } from "../../packages/core/src/index.js";

describe("Request integration", () => {
  it("should read request body and allow reading it multiple times", async () => {
    let serverReqBody: Buffer | undefined;
    let firstRead: Buffer | undefined;
    let secondRead: Buffer | undefined;

    const server = createServer(async (req, res) => {
      try {
        const request = new Request(req);

        const body = await request.readBody();
        const first = await request.readBody();
        const second = await request.readBody();

        serverReqBody = body;
        firstRead = first;
        secondRead = second;

        res.statusCode = 200;
        res.end("ok");
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      server.close();
      throw new Error("Failed to determine server address");
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const clientReq = httpRequest(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/",
            method: "POST",
            headers: {
              "content-type": "text/plain",
            },
          },
          (res) => {
            res.resume();
            res.once("end", () => resolve());
          },
        );

        clientReq.once("error", reject);
        clientReq.write("hello forge");
        clientReq.end();
      });

      expect(serverReqBody).toBeDefined();
      expect(serverReqBody?.toString()).toBe("hello forge");
      expect(firstRead).toBeDefined();
      expect(secondRead).toBeDefined();
      expect(secondRead).toEqual(firstRead);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("should parse JSON body when Content-Type is application/json", async () => {
    let parsedBody: unknown;

    const server = createServer(async (req, res) => {
      try {
        const request = new Request(req);
        parsedBody = await request.parseBody();
        res.statusCode = 200;
        res.end("ok");
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      server.close();
      throw new Error("Failed to determine server address");
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const clientReq = httpRequest(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/",
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
          },
          (res) => {
            res.resume();
            res.once("end", () => resolve());
          },
        );

        clientReq.once("error", reject);
        clientReq.write(JSON.stringify({ name: "Forge", version: 1 }));
        clientReq.end();
      });

      expect(parsedBody).toEqual({
        name: "Forge",
        version: 1,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("should return undefined when parsing an empty body", async () => {
    let parsedBody: unknown = "not-evaluated";

    const server = createServer(async (req, res) => {
      try {
        const request = new Request(req);
        parsedBody = await request.parseBody();
        res.statusCode = 200;
        res.end("ok");
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      server.close();
      throw new Error("Failed to determine server address");
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const clientReq = httpRequest(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/",
            method: "POST",
          },
          (res) => {
            res.resume();
            res.once("end", () => resolve());
          },
        );

        clientReq.once("error", reject);
        clientReq.end();
      });

      expect(parsedBody).toBeUndefined();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("should reject parseBody when JSON is invalid", async () => {
    let statusCode = 0;

    const server = createServer(async (req, res) => {
      try {
        const request = new Request(req);
        await expect(request.parseBody()).rejects.toThrow();
        res.statusCode = 200;
        res.end("ok");
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      server.close();
      throw new Error("Failed to determine server address");
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const clientReq = httpRequest(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/",
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
          },
          (res) => {
            statusCode = res.statusCode ?? 0;
            res.resume();
            res.once("end", () => resolve());
          },
        );

        clientReq.once("error", reject);
        clientReq.write("not valid json");
        clientReq.end();
      });

      expect(statusCode).toBe(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("should return Buffer for non-JSON body", async () => {
    let parsedBody: unknown;

    const server = createServer(async (req, res) => {
      try {
        const request = new Request(req);
        parsedBody = await request.parseBody();
        res.statusCode = 200;
        res.end("ok");
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      server.close();
      throw new Error("Failed to determine server address");
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const clientReq = httpRequest(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/",
            method: "POST",
            headers: {
              "content-type": "text/plain",
            },
          },
          (res) => {
            res.resume();
            res.once("end", () => resolve());
          },
        );

        clientReq.once("error", reject);
        clientReq.write("hello forge");
        clientReq.end();
      });

      expect(Buffer.isBuffer(parsedBody)).toBe(true);
      expect((parsedBody as Buffer).toString()).toBe("hello forge");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("should support req.body with lazy and cached parsing end-to-end", async () => {
    let bodyResult: unknown;
    let firstResult: unknown;
    let secondResult: unknown;

    const server = createServer(async (req, res) => {
      try {
        const request = new Request(req);

        const body = await request.body;
        const first = await request.body;
        const second = await request.body;

        bodyResult = body;
        firstResult = first;
        secondResult = second;

        res.statusCode = 200;
        res.end("ok");
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      server.close();
      throw new Error("Failed to determine server address");
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const clientReq = httpRequest(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/",
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
          },
          (res) => {
            res.resume();
            res.once("end", () => resolve());
          },
        );

        clientReq.once("error", reject);
        clientReq.write(JSON.stringify({ name: "Forge", version: 1 }));
        clientReq.end();
      });

      expect(bodyResult).toEqual({
        name: "Forge",
        version: 1,
      });

      expect(secondResult).toBe(firstResult);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

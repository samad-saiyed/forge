import { request } from "node:http";
import { describe, expect, it } from "vitest";
import { createApp } from "../../packages/core/src/index.js";

describe("Application HTTP runtime", () => {
  it("should respond with 404 when no route is registered", async () => {
    const app = createApp();
    const server = app.listen(0);

    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const address = server.address();

    if (address === null || typeof address === "string") {
      await app.close();
      throw new Error("Failed to determine server address");
    }

    const response = await new Promise<{
      statusCode?: number;
    }>((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/",
          method: "GET",
        },
        (res) => {
          res.resume();
          res.once("end", () => {
            resolve({
              statusCode: res.statusCode,
            });
          });
        },
      );

      req.once("error", reject);
      req.end();
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it("should handle registered GET route and respond with JSON", async () => {
    const app = createApp();
    app.get("/api/greet", (req, res) => {
      const name = (req.query.name as string) || "Guest";
      res.status(200).json({ message: `Hello, ${name}!` });
    });

    const server = app.listen(0);
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      await app.close();
      throw new Error("Failed to determine server address");
    }

    const response = await new Promise<{
      statusCode?: number;
      contentType?: string;
      body: string;
    }>((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/api/greet?name=Forge",
          method: "GET",
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.once("end", () => {
            resolve({
              statusCode: res.statusCode,
              contentType: res.headers["content-type"],
              body: data,
            });
          });
        },
      );
      req.once("error", reject);
      req.end();
    });

    expect(response.statusCode).toBe(200);
    expect(response.contentType).toBe("application/json; charset=utf-8");
    expect(JSON.parse(response.body)).toEqual({ message: "Hello, Forge!" });

    await app.close();
  });

  it("should handle registered POST route and send response", async () => {
    const app = createApp();
    app.post("/items", (_req, res) => {
      res.status(201).set("x-item-id", "123").send("Created");
    });

    const server = app.listen(0);
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      await app.close();
      throw new Error("Failed to determine server address");
    }

    const response = await new Promise<{
      statusCode?: number;
      itemId?: string;
      body: string;
    }>((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/items",
          method: "POST",
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.once("end", () => {
            resolve({
              statusCode: res.statusCode,
              itemId: res.headers["x-item-id"] as string,
              body: data,
            });
          });
        },
      );
      req.once("error", reject);
      req.end();
    });

    expect(response.statusCode).toBe(201);
    expect(response.itemId).toBe("123");
    expect(response.body).toBe("Created");

    await app.close();
  });

  it("should extract route parameters in HTTP request handlers", async () => {
    const app = createApp();
    app.get("/users/:userId/posts/:postId", (req, res) => {
      res.json({
        userId: req.params.userId,
        postId: req.params.postId,
      });
    });

    const server = app.listen(0);
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      await app.close();
      throw new Error("Failed to determine server address");
    }

    const response = await new Promise<{
      statusCode?: number;
      body: string;
    }>((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/users/usr_42/posts/pst_99",
          method: "GET",
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.once("end", () => {
            resolve({
              statusCode: res.statusCode,
              body: data,
            });
          });
        },
      );
      req.once("error", reject);
      req.end();
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      userId: "usr_42",
      postId: "pst_99",
    });

    await app.close();
  });

  it("should respond with 200 for matched route, 405 for wrong method on existing path, and 404 for nonexistent path", async () => {
    const app = createApp();
    app.get("/users", (_req, res) => {
      res.status(200).send("OK");
    });

    const server = app.listen(0);
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      await app.close();
      throw new Error("Failed to determine server address");
    }

    const sendRequest = (method: string, path: string) => {
      return new Promise<number | undefined>((resolve, reject) => {
        const req = request(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path,
            method,
          },
          (res) => {
            res.resume();
            res.once("end", () => resolve(res.statusCode));
          },
        );
        req.once("error", reject);
        req.end();
      });
    };

    const getUsersStatus = await sendRequest("GET", "/users");
    const postUsersStatus = await sendRequest("POST", "/users");
    const getNotExistStatus = await sendRequest("GET", "/does-not-exist");

    expect(getUsersStatus).toBe(200);
    expect(postUsersStatus).toBe(405);
    expect(getNotExistStatus).toBe(404);

    await app.close();
  });
});

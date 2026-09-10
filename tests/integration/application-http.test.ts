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
});

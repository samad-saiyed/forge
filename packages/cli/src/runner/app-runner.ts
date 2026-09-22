import { loadApplicationContext } from "@kyuujs/core";

async function run(): Promise<void> {
  const projectRoot =
    process.env.KYUU_PROJECT_ROOT ?? process.env.KYUU_PROJECT_ROOT ?? process.cwd();

  try {
    const context = await loadApplicationContext({ projectRoot });
    const server = context.app.listen();

    if (!server.listening) {
      await new Promise<void>((res, rej) => {
        server.once("listening", res);
        server.once("error", rej);
      });
    }

    const address = server.address();
    let port = context.config.server.port;
    let host = context.config.server.host;
    if (address && typeof address === "object") {
      port = address.port;
      host = address.address;
    }

    const url = `http://${host === "0.0.0.0" || host === "127.0.0.1" ? "localhost" : host}:${port}`;

    if (process.send) {
      process.send({ type: "started", port, host, url });
    }

    const cleanup = async () => {
      try {
        await context.app.close();
      } catch {
        // Ignore shutdown errors
      }
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("message", (msg) => {
      if (msg === "shutdown") {
        cleanup();
      }
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (process.send) {
      process.send({
        type: "error",
        error: errorMsg,
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
    process.exit(1);
  }
}

run();

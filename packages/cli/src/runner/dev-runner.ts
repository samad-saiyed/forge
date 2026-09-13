import { fork, type ChildProcess } from "node:child_process";
import { existsSync, watch as fsWatch, type FSWatcher } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface DevServerOptions {
  projectRoot: string;
  watch?: boolean;
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
}

export interface DevServerController {
  url?: string;
  port?: number;
  host?: string;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
}

function getRunnerPathAndArgs(): { execPath: string; execArgs: string[] } {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  const jsInSameDir = resolve(currentDir, "app-runner.js");
  if (existsSync(jsInSameDir)) {
    return { execPath: jsInSameDir, execArgs: ["--experimental-strip-types"] };
  }

  const jsInDist = resolve(currentDir, "..", "..", "dist", "runner", "app-runner.js");
  if (existsSync(jsInDist)) {
    return { execPath: jsInDist, execArgs: ["--experimental-strip-types"] };
  }

  const tsInSameDir = resolve(currentDir, "app-runner.ts");
  if (existsSync(tsInSameDir)) {
    return { execPath: tsInSameDir, execArgs: ["--experimental-strip-types"] };
  }

  return { execPath: jsInSameDir, execArgs: ["--experimental-strip-types"] };
}

export async function startDevServer(options: DevServerOptions): Promise<DevServerController> {
  const writeOut = options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const writeErr = options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));
  const shouldWatch = options.watch ?? true;
  const projectRoot = resolve(options.projectRoot);

  let currentChild: ChildProcess | null = null;
  let watchers: FSWatcher[] = [];
  let debounceTimer: NodeJS.Timeout | null = null;

  let currentUrl: string | undefined;
  let currentPort: number | undefined;
  let currentHost: string | undefined;

  const { execPath, execArgs } = getRunnerPathAndArgs();

  const stopChild = async (): Promise<void> => {
    if (!currentChild) return;
    const child = currentChild;
    currentChild = null;

    if (child.exitCode !== null || child.killed) {
      return;
    }

    await new Promise<void>((res) => {
      const timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Ignore kill error
        }
        res();
      }, 2000);

      child.once("exit", () => {
        clearTimeout(timer);
        res();
      });

      try {
        if (child.connected) {
          child.send("shutdown");
        } else {
          child.kill("SIGINT");
        }
      } catch {
        child.kill("SIGINT");
      }
    });
  };

  const spawnChild = async (): Promise<boolean> => {
    await stopChild();

    return new Promise<boolean>((res) => {
      const child = fork(execPath, [], {
        execArgv: execArgs,
        env: {
          ...process.env,
          FORGE_PROJECT_ROOT: projectRoot,
          NODE_ENV: "development",
        },
        stdio: ["inherit", "pipe", "pipe", "ipc"],
      });

      currentChild = child;
      let handled = false;

      child.stdout?.on("data", (chunk: Buffer) => {
        writeOut(chunk.toString("utf8").trimEnd());
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        writeErr(chunk.toString("utf8").trimEnd());
      });

      child.on("message", (msg: unknown) => {
        if (typeof msg === "object" && msg !== null && "type" in msg) {
          const payload = msg as {
            type: string;
            port?: number;
            host?: string;
            url?: string;
            error?: string;
          };
          if (payload.type === "started") {
            handled = true;
            currentPort = payload.port;
            currentHost = payload.host;
            currentUrl = payload.url;

            const banner = [
              "Forge",
              "",
              "✓ Configuration loaded",
              "✓ Routes loaded",
              "✓ Server started",
              "",
              `Local: ${payload.url}`,
            ].join("\n");
            writeOut(banner);
            res(true);
          } else if (payload.type === "error") {
            handled = true;
            writeErr(`Unable to start Forge server.\n\n${payload.error}`);
            res(false);
          }
        }
      });

      child.on("exit", (code) => {
        if (!handled) {
          handled = true;
          if (code !== 0) {
            writeErr(`Application process exited with code ${code}.`);
          }
          res(false);
        }
      });
    });
  };

  const restart = async (): Promise<void> => {
    writeOut("\nFile change detected. Restarting application...");
    const success = await spawnChild();
    if (!success) {
      writeErr("\n✗ Failed to restart Forge application.\nWaiting for changes...");
    }
  };

  // Initial spawn
  await spawnChild();

  // Watcher setup
  if (shouldWatch) {
    const handleFileChange = (_eventType: string, filename: string | null) => {
      if (filename) {
        const lower = filename.toLowerCase();
        if (
          lower.includes("node_modules") ||
          lower.includes(".git") ||
          lower.includes("dist") ||
          lower.includes("coverage")
        ) {
          return;
        }
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        void restart();
      }, 150);
    };

    try {
      // Watch project root for forge.config changes
      const rootWatcher = fsWatch(projectRoot, { recursive: false }, handleFileChange);
      watchers.push(rootWatcher);

      // Watch src directory for app route changes
      const srcDir = join(projectRoot, "src");
      if (existsSync(srcDir)) {
        const srcWatcher = fsWatch(srcDir, { recursive: true }, handleFileChange);
        watchers.push(srcWatcher);
      }
    } catch {
      // Fallback if watching fails
    }
  }

  const cleanupAll = async (): Promise<void> => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        // Ignore close error
      }
    }
    watchers = [];
    await stopChild();
  };

  // Signal handlers
  const sigintHandler = () => {
    void cleanupAll().then(() => process.exit(0));
  };
  process.once("SIGINT", sigintHandler);
  process.once("SIGTERM", sigintHandler);

  return {
    get url() {
      return currentUrl;
    },
    get port() {
      return currentPort;
    },
    get host() {
      return currentHost;
    },
    stop: async () => {
      process.removeListener("SIGINT", sigintHandler);
      process.removeListener("SIGTERM", sigintHandler);
      await cleanupAll();
    },
    restart,
  };
}

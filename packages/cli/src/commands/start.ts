import { resolve } from "node:path";
import { BUILD_OUTPUT_DIR, startProductionServer, type ProductionRunnerResult } from "@forge/core";
import type { BaseCliOptions, CliResult } from "../dispatcher.js";

export interface StartCommandOptions extends BaseCliOptions {
  /** Target project root directory */
  projectRoot?: string;
  /** Working directory override */
  cwd?: string;
  /** Port override for production HTTP server */
  port?: number;
  /** Host override for production HTTP server */
  host?: string;
  /** If true, attaches SIGINT/SIGTERM process signal handlers for graceful shutdown */
  attachSignalHandlers?: boolean;
}

export interface StartCommandResult extends CliResult {
  runnerResult?: ProductionRunnerResult;
}

/**
 * Handles the "forge start" command execution pipeline.
 */
export async function handleStartCommand(
  args: string[] = [],
  options: StartCommandOptions = {},
): Promise<StartCommandResult> {
  void args;
  const writeOut = options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const writeErr = options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));

  const rawRoot = options.projectRoot ?? options.cwd ?? process.cwd();
  const projectRoot = resolve(rawRoot);

  try {
    const runnerResult = await startProductionServer({
      projectRoot,
      port: options.port,
      host: options.host,
    });

    const host = runnerResult.config.server.host;
    const port = runnerResult.config.server.port;
    const displayHost = host === "0.0.0.0" ? "localhost" : host;
    const serverUrl = `http://${displayHost}:${port}`;

    const outputLines = [
      `Forge production server running at ${serverUrl}`,
      "",
      `  Build output: ${BUILD_OUTPUT_DIR}`,
      `  Language:     ${runnerResult.manifest.metadata.language}`,
      `  Routes:       ${runnerResult.manifest.routes.length}`,
    ];

    const message = outputLines.join("\n");
    writeOut(message);

    if (options.attachSignalHandlers !== false) {
      const shutdown = async () => {
        try {
          await runnerResult.app.close();
          writeOut("Forge server shut down gracefully.");
        } catch {
          // ignore shutdown errors on exit
        }
      };

      process.once("SIGINT", () => {
        void shutdown();
      });
      process.once("SIGTERM", () => {
        void shutdown();
      });
    }

    return {
      exitCode: 0,
      output: message,
      runnerResult,
    };
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    const errText = `Forge production server failed to start.\n\n${errMessage}`;
    writeErr(errText);
    return {
      exitCode: 1,
      output: errText,
    };
  }
}

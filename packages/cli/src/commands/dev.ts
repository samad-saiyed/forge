import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { findConfigFile } from "@kyuujs/core";
import type { BaseCliOptions, CliResult } from "../dispatcher.js";
import { startDevServer, type DevServerController } from "../runner/dev-runner.js";

export interface DevCommandOptions extends BaseCliOptions {
  projectRoot?: string;
  cwd?: string;
  watch?: boolean;
}

export interface DevCommandResult extends CliResult {
  controller?: DevServerController;
}

/**
 * Handles the "kyuu dev" command execution pipeline.
 */
export async function handleDevCommand(
  args: string[] = [],
  options: DevCommandOptions = {},
): Promise<DevCommandResult> {
  void args;
  const writeOut = options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const writeErr = options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));

  const rawRoot = options.projectRoot ?? options.cwd ?? process.cwd();
  const projectRoot = resolve(rawRoot);

  const configFile = findConfigFile(projectRoot);
  const hasPkgJson = existsSync(join(projectRoot, "package.json"));

  if (!configFile && !hasPkgJson) {
    const errText = [
      "Kyuu project not found.",
      "",
      "Could not locate kyuu.config.ts from:",
      `  ${projectRoot}`,
      "",
      'Run "kyuu new <name>" to create a new project.',
    ].join("\n");
    writeErr(errText);
    return { exitCode: 3, output: errText };
  }

  let controller: DevServerController;
  try {
    controller = await startDevServer({
      projectRoot,
      watch: options.watch ?? true,
      stdout: writeOut,
      stderr: writeErr,
    });
  } catch (err: unknown) {
    const errText = `Failed to start development server: ${err instanceof Error ? err.message : String(err)}`;
    writeErr(errText);
    return { exitCode: 4, output: errText };
  }

  if (!controller.url) {
    await controller.stop();
    const errText = "Failed to start development server.";
    return { exitCode: 4, output: errText };
  }

  if (options.watch === false) {
    await controller.stop();
    return { exitCode: 0, output: "Development server started and stopped cleanly.", controller };
  }

  return { exitCode: 0, output: `Development server running at ${controller.url}`, controller };
}

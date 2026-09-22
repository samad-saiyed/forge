import { resolve } from "node:path";
import { BUILD_OUTPUT_DIR, BuildOrchestrator, type BuildResult } from "@kyuujs/core";
import type { BaseCliOptions, CliResult } from "../dispatcher.js";

export interface BuildCommandOptions extends BaseCliOptions {
  /** Target project root directory */
  projectRoot?: string;
  /** Working directory override */
  cwd?: string;
}

export interface BuildCommandResult extends CliResult {
  buildResult?: BuildResult;
}

/**
 * Handles the "kyuu build" command execution pipeline.
 */
export async function handleBuildCommand(
  args: string[] = [],
  options: BuildCommandOptions = {},
): Promise<BuildCommandResult> {
  void args;
  const writeOut = options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const writeErr = options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));

  const rawRoot = options.projectRoot ?? options.cwd ?? process.cwd();
  const projectRoot = resolve(rawRoot);

  try {
    const orchestrator = new BuildOrchestrator({ projectRoot });
    const buildResult = await orchestrator.build();

    const outputLines = [
      "Kyuu build complete.",
      "",
      `  Build output: ${BUILD_OUTPUT_DIR}`,
      `  Language:     ${buildResult.language}`,
      `  Routes:       ${buildResult.manifest.routes.length}`,
    ];

    const message = outputLines.join("\n");
    writeOut(message);

    return {
      exitCode: 0,
      output: message,
      buildResult,
    };
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    const errText = `Kyuu build failed.\n\n${errMessage}`;
    writeErr(errText);
    return {
      exitCode: 1,
      output: errText,
    };
  }
}

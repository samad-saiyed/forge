import type { Server } from "node:http";
import { resolve } from "node:path";
import {
  loadApplicationContext,
  type ApplicationContext,
  type ResolvedForgeConfig,
} from "@forge/core";

export { handleDevCommand, type DevCommandOptions, type DevCommandResult } from "./commands/dev.js";
export { handleNewCommand, type NewCommandOptions } from "./commands/new.js";
export { runCli, type BaseCliOptions, type CliResult, type RunCliOptions } from "./dispatcher.js";
export { getHelpText } from "./help.js";
export { initializeGitRepo, type GitInitResult } from "./project/git.js";
export {
  type PackageManager,
  type ProjectCreationOptions,
  type ProjectLanguage,
} from "./project/options.js";
export { installDependencies, type InstallResult } from "./project/package-manager.js";
export { scaffoldProject } from "./project/scaffolder.js";
export { validateProjectName, type ValidationResult } from "./project/validation.js";
export { CancelledError, runWizard, type WizardOptions } from "./project/wizard.js";
export {
  startDevServer,
  type DevServerController,
  type DevServerOptions,
} from "./runner/dev-runner.js";
export { getVersion } from "./version.js";

export interface CliOptions {
  projectRoot?: string;
  mode?: "development" | "production";
}

export interface CliStartResult {
  context: ApplicationContext;
  server: Server;
  config: ResolvedForgeConfig;
}

/**
 * Common startup pipeline for Forge CLI commands.
 * Establishes project root, delegates to loadApplicationContext for automatic config discovery,
 * and starts the HTTP server on the resolved host and port.
 */
export async function runCliCommand(
  mode: "development" | "production",
  options?: CliOptions,
): Promise<CliStartResult> {
  const projectRoot = options?.projectRoot ? resolve(options.projectRoot) : process.cwd();

  const context = await loadApplicationContext({
    projectRoot,
  });

  const server = context.app.listen();

  if (!server.listening) {
    await new Promise<void>((res, rej) => {
      server.once("listening", res);
      server.once("error", rej);
    });
  }

  return {
    context,
    server,
    config: context.config,
  };
}

export async function runDev(options?: CliOptions): Promise<CliStartResult> {
  return runCliCommand("development", options);
}

export async function runStart(options?: CliOptions): Promise<CliStartResult> {
  return runCliCommand("production", options);
}

import { handleBuildCommand, type BuildCommandOptions } from "./commands/build.js";
import { handleDevCommand, type DevCommandOptions } from "./commands/dev.js";
import { handleNewCommand, type NewCommandOptions } from "./commands/new.js";
import { getHelpText } from "./help.js";
import { getVersion } from "./version.js";

export interface BaseCliOptions {
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
}

export interface RunCliOptions
  extends BaseCliOptions, NewCommandOptions, DevCommandOptions, BuildCommandOptions {}

export interface CliResult {
  exitCode: number;
  output: string;
}

/**
 * Main command dispatcher for Forge CLI.
 * Inspects args for flags and commands, delegating to appropriate handlers.
 */
export async function runCli(args: string[] = [], options: RunCliOptions = {}): Promise<CliResult> {
  const writeOut = options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const writeErr = options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));

  const hasHelp = args.includes("--help") || args.includes("-h");
  const hasVersion = args.includes("--version") || args.includes("-v");

  // 1. Help flag or bare invocation
  if (args.length === 0 || hasHelp) {
    const text = getHelpText();
    writeOut(text);
    return { exitCode: 0, output: text };
  }

  // 2. Version flag
  if (hasVersion) {
    const version = getVersion();
    writeOut(version);
    return { exitCode: 0, output: version };
  }

  // 3. Command resolution
  const firstArg = args[0];

  if (firstArg === "dev") {
    return handleDevCommand(args.slice(1), options);
  }

  if (firstArg === "build") {
    return handleBuildCommand(args.slice(1), options);
  }

  if (firstArg === "new") {
    return handleNewCommand(args.slice(1), options);
  }

  if (firstArg.startsWith("-")) {
    const errText = `Unknown option: ${firstArg}\n\nRun "forge --help" for available options.`;
    writeErr(errText);
    return { exitCode: 1, output: errText };
  }

  const errText = `Unknown command: ${firstArg}\n\nRun "forge --help" for available commands.`;
  writeErr(errText);
  return { exitCode: 1, output: errText };
}

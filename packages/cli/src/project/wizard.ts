import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { PackageManager, ProjectCreationOptions, ProjectLanguage } from "./options.js";

export interface WizardOptions {
  name: string;
  directory: string;
  defaults?: Partial<ProjectCreationOptions>;
  interactive?: boolean;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export class CancelledError extends Error {
  constructor() {
    super("Project creation cancelled by user.");
    this.name = "CancelledError";
  }
}

/**
 * Runs the interactive project creation wizard to resolve ProjectCreationOptions.
 */
export async function runWizard(options: WizardOptions): Promise<ProjectCreationOptions> {
  const isInteractive = options.interactive ?? Boolean(process.stdout.isTTY && !process.env.CI);

  // If non-interactive, return options immediately using defaults
  if (!isInteractive) {
    return {
      name: options.name,
      directory: options.directory,
      language: options.defaults?.language ?? "typescript",
      packageManager: options.defaults?.packageManager ?? "pnpm",
      initializeGit: options.defaults?.initializeGit ?? true,
      skipInstall: options.defaults?.skipInstall ?? false,
    };
  }

  const rl = createInterface({
    input: options.input ?? input,
    output: options.output ?? output,
  });

  let cancelled = false;
  rl.on("SIGINT", () => {
    cancelled = true;
    rl.close();
  });

  try {
    // Question 1: Language
    const langAnswer = await rl.question(
      "\nWhich language would you like to use?\n  1) TypeScript (default)\n  2) JavaScript\nSelect [1-2]: ",
    );
    if (cancelled) throw new CancelledError();
    const language: ProjectLanguage = langAnswer.trim() === "2" ? "javascript" : "typescript";

    // Question 2: Package Manager
    const pmAnswer = await rl.question(
      "\nWhich package manager would you like to use?\n  1) pnpm (default)\n  2) npm\n  3) yarn\nSelect [1-3]: ",
    );
    if (cancelled) throw new CancelledError();
    let packageManager: PackageManager = "pnpm";
    if (pmAnswer.trim() === "2") packageManager = "npm";
    if (pmAnswer.trim() === "3") packageManager = "yarn";

    // Question 3: Git
    const gitAnswer = await rl.question("\nInitialize a Git repository? [Y/n]: ");
    if (cancelled) throw new CancelledError();
    const initializeGit = !gitAnswer.trim().toLowerCase().startsWith("n");

    rl.close();

    return {
      name: options.name,
      directory: options.directory,
      language,
      packageManager,
      initializeGit,
      skipInstall: options.defaults?.skipInstall ?? false,
    };
  } catch (err) {
    rl.close();
    if (cancelled || (err instanceof Error && err.name === "AbortError")) {
      throw new CancelledError();
    }
    throw err;
  }
}

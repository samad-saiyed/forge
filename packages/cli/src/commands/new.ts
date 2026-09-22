import type { BaseCliOptions, CliResult } from "../dispatcher.js";
import { initializeGitRepo } from "../project/git.js";
import { installDependencies } from "../project/package-manager.js";
import { scaffoldProject } from "../project/scaffolder.js";
import { validateProjectName } from "../project/validation.js";
import { CancelledError, runWizard } from "../project/wizard.js";
import type { ProjectCreationOptions } from "../project/options.js";

export interface NewCommandOptions extends BaseCliOptions {
  cwd?: string;
  defaults?: Partial<ProjectCreationOptions>;
  interactive?: boolean;
}

/**
 * Handles the "kyuu new <name>" command execution pipeline.
 */
export async function handleNewCommand(
  args: string[] = [],
  options: NewCommandOptions = {},
): Promise<CliResult> {
  const writeOut = options.stdout ?? ((msg: string) => process.stdout.write(msg + "\n"));
  const writeErr = options.stderr ?? ((msg: string) => process.stderr.write(msg + "\n"));

  const rawName = args[0];

  if (!rawName || rawName.trim().length === 0) {
    const errText = "Error: Missing project name.\nUsage: kyuu new <name>";
    writeErr(errText);
    return { exitCode: 1, output: errText };
  }

  const validation = validateProjectName(rawName, options.cwd);
  if (!validation.valid || !validation.targetDirectory) {
    const errText = `Error: ${validation.error}`;
    writeErr(errText);
    return { exitCode: 3, output: errText };
  }

  let creationOptions: ProjectCreationOptions;
  try {
    creationOptions = await runWizard({
      name: rawName.trim(),
      directory: validation.targetDirectory,
      defaults: options.defaults,
      interactive: options.interactive,
    });
  } catch (err) {
    if (err instanceof CancelledError) {
      const cancelText = "Operation cancelled. No project was created.";
      writeOut(cancelText);
      return { exitCode: 0, output: cancelText };
    }
    const errText = `Error: ${err instanceof Error ? err.message : String(err)}`;
    writeErr(errText);
    return { exitCode: 1, output: errText };
  }

  // 1. Scaffold files
  try {
    await scaffoldProject(creationOptions);
  } catch (err: unknown) {
    const errText = `Scaffolding failed: ${err instanceof Error ? err.message : String(err)}`;
    writeErr(errText);
    return { exitCode: 1, output: errText };
  }

  let installSuccess = true;
  // 2. Install dependencies (unless skipInstall is true)
  if (!creationOptions.skipInstall) {
    const installResult = await installDependencies(
      creationOptions.directory,
      creationOptions.packageManager,
    );
    if (!installResult.success) {
      installSuccess = false;
      writeErr(`Warning: Dependency installation failed.\n${installResult.error}`);
    }
  }

  // 3. Initialize Git if requested
  if (creationOptions.initializeGit) {
    const gitResult = await initializeGitRepo(creationOptions.directory);
    if (!gitResult.success) {
      writeErr("Warning: Git initialization failed. You can initialize Git manually.");
    }
  }

  // 4. Report final success and next steps
  const successLines = [
    `✔ Kyuu project "${creationOptions.name}" created successfully.`,
    "",
    "Next steps:",
    `  cd ${creationOptions.name}`,
  ];

  if (creationOptions.skipInstall || !installSuccess) {
    successLines.push(`  ${creationOptions.packageManager} install`);
  }

  successLines.push(`  ${creationOptions.packageManager} run dev`);

  const successText = successLines.join("\n");
  writeOut(successText);

  return { exitCode: 0, output: successText };
}

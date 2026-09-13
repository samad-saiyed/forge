import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PackageManager } from "./options.js";

const execFileAsync = promisify(execFile);

export interface InstallResult {
  success: boolean;
  error?: string;
}

/**
 * Installs project dependencies using the selected package manager.
 */
export async function installDependencies(
  directory: string,
  pm: PackageManager,
  execFn: typeof execFileAsync = execFileAsync,
): Promise<InstallResult> {
  try {
    const cmd = pm;
    const args = ["install"];

    await execFn(cmd, args, {
      cwd: directory,
      shell: process.platform === "win32",
    });

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
    };
  }
}

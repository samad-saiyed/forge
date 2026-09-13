import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitInitResult {
  success: boolean;
  error?: string;
}

/**
 * Initializes a Git repository in the target directory if requested.
 */
export async function initializeGitRepo(
  directory: string,
  execFn: typeof execFileAsync = execFileAsync,
): Promise<GitInitResult> {
  try {
    await execFn("git", ["init"], {
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

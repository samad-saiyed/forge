import { existsSync, readdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  targetDirectory?: string;
}

/**
 * Validates project name and resolves the target directory.
 */
export function validateProjectName(name: string, cwd: string = process.cwd()): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Project name cannot be empty." };
  }

  const trimmed = name.trim();

  // Prevent path traversal and relative navigation in project name
  if (
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    isAbsolute(trimmed)
  ) {
    return {
      valid: false,
      error: `Invalid project name "${trimmed}". Path traversal and absolute paths are not allowed.`,
    };
  }

  // Prevent invalid npm package / directory name characters
  const validNameRegex = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;
  if (!validNameRegex.test(trimmed)) {
    return {
      valid: false,
      error: `Invalid project name "${trimmed}". Must be a valid package/directory name.`,
    };
  }

  const targetDirectory = resolve(cwd, trimmed);

  if (existsSync(targetDirectory)) {
    try {
      const files = readdirSync(targetDirectory);
      if (files.length > 0) {
        return {
          valid: false,
          error: `Target directory already exists and is non-empty: ${targetDirectory}`,
          targetDirectory,
        };
      }
    } catch {
      return {
        valid: false,
        error: `Target directory cannot be read: ${targetDirectory}`,
        targetDirectory,
      };
    }
  }

  return {
    valid: true,
    targetDirectory,
  };
}

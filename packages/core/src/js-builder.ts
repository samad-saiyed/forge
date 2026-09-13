import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { toPosixPath } from "./build.js";
import { findConfigFile } from "./config.js";

export interface JavaScriptBuildOptions {
  projectRoot: string;
  stagingDir: string;
}

export interface JavaScriptBuildResult {
  success: boolean;
  copiedFiles: string[];
}

export class JavaScriptBuildError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JavaScriptBuildError";
  }
}

/**
 * Detects whether a project is a TypeScript project or JavaScript project.
 */
export function detectProjectLanguage(projectRoot: string): "typescript" | "javascript" {
  const root = resolve(projectRoot);
  if (existsSync(join(root, "tsconfig.json"))) {
    return "typescript";
  }

  const srcDir = join(root, "src");
  if (existsSync(srcDir)) {
    const hasTs = scanForTsExtension(srcDir);
    if (hasTs) return "typescript";
  }

  return "javascript";
}

function scanForTsExtension(dirPath: string): boolean {
  if (!existsSync(dirPath)) return false;
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const lower = entry.name.toLowerCase();
      if (lower !== "node_modules" && lower !== "dist" && lower !== ".git" && lower !== ".forge") {
        if (scanForTsExtension(fullPath)) return true;
      }
    } else if (entry.isFile()) {
      const lower = entry.name.toLowerCase();
      if (
        (lower.endsWith(".ts") || lower.endsWith(".tsx")) &&
        !lower.endsWith(".d.ts") &&
        !lower.endsWith(".test.ts") &&
        !lower.endsWith(".spec.ts")
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Recursively scans directory for JavaScript source files (.js, .jsx, .mjs, .cjs),
 * ignoring test files, dependencies, and build output directories.
 */
function scanJsFiles(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  const results: string[] = [];

  function walk(current: string) {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        const lower = entry.name.toLowerCase();
        if (
          lower !== "node_modules" &&
          lower !== "dist" &&
          lower !== ".git" &&
          lower !== "coverage" &&
          lower !== ".forge" &&
          lower !== "tests" &&
          lower !== "test"
        ) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (
          (lower.endsWith(".js") ||
            lower.endsWith(".mjs") ||
            lower.endsWith(".jsx") ||
            lower.endsWith(".cjs")) &&
          !lower.endsWith(".test.js") &&
          !lower.endsWith(".spec.js") &&
          !lower.endsWith(".test.jsx") &&
          !lower.endsWith(".spec.jsx") &&
          !lower.endsWith(".test.mjs") &&
          !lower.endsWith(".spec.mjs")
        ) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dirPath);
  return results;
}

/**
 * Processes a JavaScript Forge project for production build into the staging directory.
 */
export function processJavaScriptProject(options: JavaScriptBuildOptions): JavaScriptBuildResult {
  const projectRoot = resolve(options.projectRoot);
  const stagingDir = resolve(options.stagingDir);

  const filesToCopy: string[] = [];

  // Check config file
  try {
    const configFile = findConfigFile(projectRoot);
    if (configFile && existsSync(configFile)) {
      filesToCopy.push(configFile);
    }
  } catch (err) {
    throw new JavaScriptBuildError(
      `Failed during configuration file search: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  // Check src directory
  const srcDir = join(projectRoot, "src");
  if (existsSync(srcDir)) {
    filesToCopy.push(...scanJsFiles(srcDir));
  }

  if (filesToCopy.length === 0) {
    throw new JavaScriptBuildError(
      `No JavaScript source files found in project root '${projectRoot}'.`,
    );
  }

  const copiedFiles: string[] = [];

  for (const sourceFile of filesToCopy) {
    const rel = relative(projectRoot, sourceFile);
    const targetFile = join(stagingDir, rel);

    try {
      mkdirSync(dirname(targetFile), { recursive: true });
      copyFileSync(sourceFile, targetFile);
      copiedFiles.push(toPosixPath(relative(stagingDir, targetFile)));
    } catch (err) {
      throw new JavaScriptBuildError(
        `Failed to copy source file '${rel}' to staging directory: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }

  return {
    success: true,
    copiedFiles,
  };
}

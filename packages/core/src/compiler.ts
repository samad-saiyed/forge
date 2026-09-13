import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { toPosixPath } from "./build.js";

export interface CompileOptions {
  projectRoot: string;
  stagingDir: string;
}

export interface CompileResult {
  success: boolean;
  emittedFiles: string[];
  diagnostics: string[];
}

export class TypeScriptCompileError extends Error {
  readonly diagnostics: string[];

  constructor(diagnostics: string[]) {
    super(
      `TypeScript compilation failed with ${diagnostics.length} error(s):\n` +
        diagnostics.join("\n"),
    );
    this.name = "TypeScriptCompileError";
    this.diagnostics = diagnostics;
  }
}

/**
 * Recursively scans directory for TypeScript files (.ts, .tsx), ignoring test files and node_modules.
 */
function scanTsFiles(dirPath: string): string[] {
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
          lower !== ".forge"
        ) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (
          (lower.endsWith(".ts") || lower.endsWith(".tsx")) &&
          !lower.endsWith(".d.ts") &&
          !lower.endsWith(".test.ts") &&
          !lower.endsWith(".spec.ts")
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
 * Compiles a TypeScript Forge project into the staging directory for production builds.
 */
export function compileTypeScriptProject(options: CompileOptions): CompileResult {
  const projectRoot = resolve(options.projectRoot);
  const stagingDir = resolve(options.stagingDir);

  const tsconfigPath = join(projectRoot, "tsconfig.json");
  let baseCompilerOptions: ts.CompilerOptions = {};

  if (existsSync(tsconfigPath)) {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (!configFile.error && configFile.config) {
      const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot);
      baseCompilerOptions = parsedConfig.options;
    }
  }

  // Collect source files: forge.config.ts and src/ app files
  const rootFiles: string[] = [];
  const configTs = join(projectRoot, "forge.config.ts");
  if (existsSync(configTs)) {
    rootFiles.push(configTs);
  }

  const srcDir = join(projectRoot, "src");
  if (existsSync(srcDir)) {
    rootFiles.push(...scanTsFiles(srcDir));
  }

  if (rootFiles.length === 0) {
    throw new Error(`No TypeScript source files found in project root '${projectRoot}'.`);
  }

  // Enforce production ESM compiler options targeting stagingDir
  const compilerOptions: ts.CompilerOptions = {
    ...baseCompilerOptions,
    outDir: stagingDir,
    rootDir: projectRoot,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    esModuleInterop: true,
    strict: true,
    sourceMap: true,
    inlineSources: false,
    declaration: false,
    noEmit: false,
  };

  const program = ts.createProgram(rootFiles, compilerOptions);
  const preDiagnostics = ts.getPreEmitDiagnostics(program);

  const errorDiagnostics: string[] = [];

  for (const diag of preDiagnostics) {
    if (diag.category === ts.DiagnosticCategory.Error) {
      let message = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
      if (diag.file && diag.start !== undefined) {
        const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
        const relPath = toPosixPath(relative(projectRoot, diag.file.fileName));
        message = `${relPath}:${line + 1}:${character + 1} - error TS${diag.code}: ${message}`;
      }
      errorDiagnostics.push(message);
    }
  }

  if (errorDiagnostics.length > 0) {
    throw new TypeScriptCompileError(errorDiagnostics);
  }

  const emitResult = program.emit();
  const emittedFiles: string[] = [];

  for (const file of emitResult.emittedFiles ?? []) {
    emittedFiles.push(toPosixPath(relative(stagingDir, file)));
  }

  return {
    success: !emitResult.emitSkipped,
    emittedFiles,
    diagnostics: [],
  };
}

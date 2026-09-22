import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateProjectName } from "../../packages/cli/src/project/validation.js";
import { scaffoldProject } from "../../packages/cli/src/project/scaffolder.js";

describe("Kyuu CLI New Command Unit Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `kyuu-unit-new-test-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("validates empty project names", () => {
    const result = validateProjectName("", tempDir);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("cannot be empty");
  });

  it("validates path traversal in project names", () => {
    const result1 = validateProjectName("../foo", tempDir);
    expect(result1.valid).toBe(false);
    expect(result1.error).toContain("Path traversal");

    const result2 = validateProjectName("nested/foo", tempDir);
    expect(result2.valid).toBe(false);
    expect(result2.error).toContain("Path traversal");
  });

  it("validates invalid directory characters", () => {
    const result = validateProjectName("project name with spaces", tempDir);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid project name");
  });

  it("accepts valid project names", () => {
    const result = validateProjectName("my-api-service", tempDir);
    expect(result.valid).toBe(true);
    expect(result.targetDirectory).toBe(join(tempDir, "my-api-service"));
  });

  it("rejects target directory if it exists and is non-empty", () => {
    const target = join(tempDir, "existing-app");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "dummy.txt"), "content");

    const result = validateProjectName("existing-app", tempDir);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("already exists and is non-empty");
  });

  it("scaffolds a valid TypeScript project structure", async () => {
    const targetDir = join(tempDir, "ts-app");
    await scaffoldProject({
      name: "ts-app",
      directory: targetDir,
      language: "typescript",
      packageManager: "pnpm",
      initializeGit: false,
      skipInstall: true,
    });

    expect(existsSync(join(targetDir, "kyuu.config.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "package.json"))).toBe(true);
    expect(existsSync(join(targetDir, "tsconfig.json"))).toBe(true);
    expect(existsSync(join(targetDir, "src", "app", "route.ts"))).toBe(true);
    expect(existsSync(join(targetDir, ".gitignore"))).toBe(true);
  });

  it("scaffolds a valid JavaScript project structure", async () => {
    const targetDir = join(tempDir, "js-app");
    await scaffoldProject({
      name: "js-app",
      directory: targetDir,
      language: "javascript",
      packageManager: "npm",
      initializeGit: false,
      skipInstall: true,
    });

    expect(existsSync(join(targetDir, "kyuu.config.js"))).toBe(true);
    expect(existsSync(join(targetDir, "package.json"))).toBe(true);
    expect(existsSync(join(targetDir, "tsconfig.json"))).toBe(false);
    expect(existsSync(join(targetDir, "src", "app", "route.js"))).toBe(true);
    expect(existsSync(join(targetDir, ".gitignore"))).toBe(true);
  });
});

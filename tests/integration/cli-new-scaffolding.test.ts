import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../../packages/cli/src/index.js";

describe("Forge CLI Scaffolding Integration Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `forge-cli-scaffold-test-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("forge new creates a runnable TypeScript project structure", async () => {
    let output = "";
    const result = await runCli(["new", "my-api"], {
      cwd: tempDir,
      interactive: false,
      defaults: {
        language: "typescript",
        packageManager: "pnpm",
        initializeGit: false,
        skipInstall: true,
      },
      stdout: (msg) => {
        output += msg + "\n";
      },
    });

    expect(result.exitCode).toBe(0);
    expect(output).toContain('✔ Forge project "my-api" created successfully.');

    const projectDir = join(tempDir, "my-api");
    expect(existsSync(join(projectDir, "forge.config.ts"))).toBe(true);
    expect(existsSync(join(projectDir, "package.json"))).toBe(true);
    expect(existsSync(join(projectDir, "tsconfig.json"))).toBe(true);
    expect(existsSync(join(projectDir, "src", "app", "route.ts"))).toBe(true);

    const pkgJson = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf8"));
    expect(pkgJson.name).toBe("my-api");
    expect(pkgJson.scripts.dev).toBe("forge dev");
  });

  it("forge new creates a valid JavaScript project structure", async () => {
    let output = "";
    const result = await runCli(["new", "my-js-api"], {
      cwd: tempDir,
      interactive: false,
      defaults: {
        language: "javascript",
        packageManager: "npm",
        initializeGit: false,
        skipInstall: true,
      },
      stdout: (msg) => {
        output += msg + "\n";
      },
    });

    expect(result.exitCode).toBe(0);
    expect(output).toContain('✔ Forge project "my-js-api" created successfully.');

    const projectDir = join(tempDir, "my-js-api");
    expect(existsSync(join(projectDir, "forge.config.js"))).toBe(true);
    expect(existsSync(join(projectDir, "package.json"))).toBe(true);
    expect(existsSync(join(projectDir, "src", "app", "route.js"))).toBe(true);

    const pkgJson = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf8"));
    expect(pkgJson.name).toBe("my-js-api");
    expect(pkgJson.scripts.dev).toBe("forge dev");
  });

  it("fails cleanly when project name argument is missing", async () => {
    let errorOutput = "";
    const result = await runCli(["new"], {
      cwd: tempDir,
      stderr: (msg) => {
        errorOutput += msg;
      },
    });

    expect(result.exitCode).toBe(1);
    expect(errorOutput).toContain("Error: Missing project name");
  });

  it("fails cleanly and returns code 3 when target directory already exists and is non-empty", async () => {
    const existingDir = join(tempDir, "occupied");
    mkdirSync(existingDir, { recursive: true });
    writeFileSync(join(existingDir, "file.txt"), "hello");

    let errorOutput = "";
    const result = await runCli(["new", "occupied"], {
      cwd: tempDir,
      stderr: (msg) => {
        errorOutput += msg;
      },
    });

    expect(result.exitCode).toBe(3);
    expect(errorOutput).toContain("Target directory already exists and is non-empty");
  });
});

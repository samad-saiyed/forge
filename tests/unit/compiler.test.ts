import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUILD_FORMAT_VERSION,
  BuildOutputManager,
  compileTypeScriptProject,
  formatBuildManifest,
  TypeScriptCompileError,
  type BuildManifest,
} from "../../packages/core/src/index.js";

describe("Action 70.3 — Production TypeScript Compilation", { timeout: 15000 }, () => {
  let tempDir: string;
  let manager: BuildOutputManager;

  const validManifest: BuildManifest = {
    metadata: {
      formatVersion: BUILD_FORMAT_VERSION,
      forgeVersion: "0.1.0",
      builtAt: new Date().toISOString(),
      language: "typescript",
      configPath: "forge.config.js",
      appDir: "src/app",
    },
    routes: [],
  };

  beforeEach(() => {
    tempDir = join(tmpdir(), `forge-compiler-test-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ type: "module" }), "utf8");
    manager = new BuildOutputManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("compiles a valid TypeScript project into the staging directory", () => {
    // Setup tsconfig.json and TypeScript source files
    writeFileSync(
      join(tempDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext" } }),
      "utf8",
    );
    writeFileSync(
      join(tempDir, "forge.config.ts"),
      `export default { server: { port: 3000 } };`,
      "utf8",
    );
    mkdirSync(join(tempDir, "src", "app", "hello"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "hello", "route.ts"),
      `export const GET = async (_req: unknown, res: { json: (data: unknown) => void }) => res.json({ hello: "world" });`,
      "utf8",
    );

    const stagingDir = manager.prepareStaging();
    const result = compileTypeScriptProject({ projectRoot: tempDir, stagingDir });

    expect(result.success).toBe(true);
    expect(existsSync(join(stagingDir, "forge.config.js"))).toBe(true);
    expect(existsSync(join(stagingDir, "forge.config.js.map"))).toBe(true);
    expect(existsSync(join(stagingDir, "src", "app", "hello", "route.js"))).toBe(true);
    expect(existsSync(join(stagingDir, "src", "app", "hello", "route.js.map"))).toBe(true);

    // Verify emitted JS remains ESM compatible
    const routeJs = readFileSync(join(stagingDir, "src", "app", "hello", "route.js"), "utf8");
    expect(routeJs).toContain("export const GET");
    expect(routeJs).not.toContain("exports.GET");
  });

  it("preserves nested source structure in output directory", () => {
    mkdirSync(join(tempDir, "src", "app", "users", "[id]"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "users", "[id]", "route.ts"),
      `export const GET = () => "user-id";`,
      "utf8",
    );

    const stagingDir = manager.prepareStaging();
    const result = compileTypeScriptProject({ projectRoot: tempDir, stagingDir });

    expect(result.success).toBe(true);
    expect(existsSync(join(stagingDir, "src", "app", "users", "[id]", "route.js"))).toBe(true);
  });

  it("fails compilation and throws TypeScriptCompileError on type errors", () => {
    mkdirSync(join(tempDir, "src", "app"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "route.ts"),
      `const num: number = "this is a string";`,
      "utf8",
    );

    const stagingDir = manager.prepareStaging();

    expect(() => compileTypeScriptProject({ projectRoot: tempDir, stagingDir })).toThrow(
      TypeScriptCompileError,
    );
  });

  it("preserves existing valid build when TypeScript compilation fails", () => {
    // 1. Initial valid build promoted to final
    const stagingDir1 = manager.prepareStaging();
    writeFileSync(
      join(tempDir, "forge.config.ts"),
      `export default { server: { port: 3000 } };`,
      "utf8",
    );
    mkdirSync(join(tempDir, "src", "app"), { recursive: true });
    const routeFile = join(tempDir, "src", "app", "route.ts");
    writeFileSync(routeFile, `export const GET = () => "ok";`, "utf8");

    compileTypeScriptProject({ projectRoot: tempDir, stagingDir: stagingDir1 });
    writeFileSync(join(stagingDir1, "manifest.json"), formatBuildManifest(validManifest));
    manager.finalize();

    expect(manager.hasValidBuild()).toBe(true);
    expect(existsSync(join(manager.finalDir, "src", "app", "route.js"))).toBe(true);

    // 2. Introduce type error for new build
    writeFileSync(routeFile, `const invalid: number = "error";`, "utf8");

    const stagingDir2 = manager.prepareStaging();
    let compileFailed = false;

    try {
      compileTypeScriptProject({ projectRoot: tempDir, stagingDir: stagingDir2 });
    } catch (err) {
      if (err instanceof TypeScriptCompileError) {
        compileFailed = true;
        manager.discardStaging();
      }
    }

    expect(compileFailed).toBe(true);
    // Existing build remains valid and untouched!
    expect(manager.hasValidBuild()).toBe(true);
    expect(existsSync(join(manager.finalDir, "src", "app", "route.js"))).toBe(true);
  });

  it("does not pollute src/ or project root with compiled JS files", () => {
    mkdirSync(join(tempDir, "src", "app"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "route.ts"),
      `export const GET = () => "clean";`,
      "utf8",
    );

    const stagingDir = manager.prepareStaging();
    compileTypeScriptProject({ projectRoot: tempDir, stagingDir });

    // Output is inside stagingDir, NOT in src/
    expect(existsSync(join(tempDir, "src", "app", "route.js"))).toBe(false);
  });
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUILD_FORMAT_VERSION,
  BuildOutputManager,
  compileTypeScriptProject,
  detectProjectLanguage,
  formatBuildManifest,
  JavaScriptBuildError,
  processJavaScriptProject,
  type BuildManifest,
} from "../../packages/core/src/index.js";

describe("Action 70.4 — JavaScript Build Support", { timeout: 15000 }, () => {
  let tempDir: string;
  let manager: BuildOutputManager;

  const validManifest: BuildManifest = {
    metadata: {
      formatVersion: BUILD_FORMAT_VERSION,
      kyuuVersion: "0.1.0",
      builtAt: new Date().toISOString(),
      language: "javascript",
      configPath: "kyuu.config.js",
      appDir: "src/app",
    },
    routes: [],
  };

  beforeEach(() => {
    tempDir = join(tmpdir(), `kyuu-js-builder-test-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ type: "module" }), "utf8");
    manager = new BuildOutputManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("builds a basic JavaScript project into the staging directory", () => {
    writeFileSync(
      join(tempDir, "kyuu.config.js"),
      `export default { server: { port: 4000 } };`,
      "utf8",
    );
    mkdirSync(join(tempDir, "src", "app", "hello"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "hello", "route.js"),
      `export const GET = (req, res) => res.json({ hello: "js-world" });`,
      "utf8",
    );

    const stagingDir = manager.prepareStaging();
    const result = processJavaScriptProject({ projectRoot: tempDir, stagingDir });

    expect(result.success).toBe(true);
    expect(existsSync(join(stagingDir, "kyuu.config.js"))).toBe(true);
    expect(existsSync(join(stagingDir, "src", "app", "hello", "route.js"))).toBe(true);
  });

  it("preserves nested directory structure in output directory", () => {
    mkdirSync(join(tempDir, "src", "app", "users", "[id]"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "users", "[id]", "route.js"),
      `export const GET = (req) => req.params.id;`,
      "utf8",
    );

    const stagingDir = manager.prepareStaging();
    const result = processJavaScriptProject({ projectRoot: tempDir, stagingDir });

    expect(result.success).toBe(true);
    expect(existsSync(join(stagingDir, "src", "app", "users", "[id]", "route.js"))).toBe(true);
  });

  it("preserves ESM syntax (import and export) in JavaScript output", () => {
    mkdirSync(join(tempDir, "src", "app", "items"), { recursive: true });
    const fileContent = `import { resolve } from "node:path";\nexport const GET = () => resolve("ok");`;
    writeFileSync(join(tempDir, "src", "app", "items", "route.js"), fileContent, "utf8");

    const stagingDir = manager.prepareStaging();
    processJavaScriptProject({ projectRoot: tempDir, stagingDir });

    const emitted = readFileSync(join(stagingDir, "src", "app", "items", "route.js"), "utf8");
    expect(emitted).toBe(fileContent);
    expect(emitted).toContain(`import { resolve } from "node:path";`);
    expect(emitted).toContain(`export const GET`);
  });

  it("handles JavaScript projects with kyuu.config.mjs configuration", () => {
    writeFileSync(
      join(tempDir, "kyuu.config.mjs"),
      `export default { server: { port: 5000 } };`,
      "utf8",
    );
    mkdirSync(join(tempDir, "src", "app"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "route.js"),
      `export const GET = () => "ok";`,
      "utf8",
    );

    const stagingDir = manager.prepareStaging();
    const result = processJavaScriptProject({ projectRoot: tempDir, stagingDir });

    expect(result.success).toBe(true);
    expect(existsSync(join(stagingDir, "kyuu.config.mjs"))).toBe(true);
    expect(existsSync(join(stagingDir, "src", "app", "route.js"))).toBe(true);
  });

  it("does not copy development-only artifacts or test files into staging", () => {
    writeFileSync(join(tempDir, "README.md"), "# Project Readme", "utf8");
    mkdirSync(join(tempDir, "tests"), { recursive: true });
    writeFileSync(join(tempDir, "tests", "app.test.js"), "// test code", "utf8");

    mkdirSync(join(tempDir, "src", "app"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "route.js"),
      `export const GET = () => "prod";`,
      "utf8",
    );
    writeFileSync(join(tempDir, "src", "app", "route.test.js"), `// test file inside src`, "utf8");

    const stagingDir = manager.prepareStaging();
    processJavaScriptProject({ projectRoot: tempDir, stagingDir });

    expect(existsSync(join(stagingDir, "src", "app", "route.js"))).toBe(true);
    expect(existsSync(join(stagingDir, "README.md"))).toBe(false);
    expect(existsSync(join(stagingDir, "tests"))).toBe(false);
    expect(existsSync(join(stagingDir, "src", "app", "route.test.js"))).toBe(false);
  });

  it("handles JS build failure safely and preserves existing valid build", () => {
    // 1. Initial valid JS build promoted to final
    const stagingDir1 = manager.prepareStaging();
    writeFileSync(
      join(tempDir, "kyuu.config.js"),
      `export default { server: { port: 3000 } };`,
      "utf8",
    );
    mkdirSync(join(tempDir, "src", "app"), { recursive: true });
    const routeFile = join(tempDir, "src", "app", "route.js");
    writeFileSync(routeFile, `export const GET = () => "v1";`, "utf8");

    processJavaScriptProject({ projectRoot: tempDir, stagingDir: stagingDir1 });
    writeFileSync(join(stagingDir1, "manifest.json"), formatBuildManifest(validManifest));
    manager.finalize();

    expect(manager.hasValidBuild()).toBe(true);
    expect(existsSync(join(manager.finalDir, "src", "app", "route.js"))).toBe(true);

    // 2. Simulate failure (no JS source files present)
    rmSync(routeFile);
    rmSync(join(tempDir, "kyuu.config.js"));

    const stagingDir2 = manager.prepareStaging();
    let buildFailed = false;

    try {
      processJavaScriptProject({ projectRoot: tempDir, stagingDir: stagingDir2 });
    } catch (err) {
      if (err instanceof JavaScriptBuildError) {
        buildFailed = true;
        manager.discardStaging();
      }
    }

    expect(buildFailed).toBe(true);
    // Existing build remains intact!
    expect(manager.hasValidBuild()).toBe(true);
    expect(existsSync(join(manager.finalDir, "src", "app", "route.js"))).toBe(true);
  });

  it("correctly detects project language as TypeScript vs JavaScript", () => {
    expect(detectProjectLanguage(tempDir)).toBe("javascript");

    writeFileSync(join(tempDir, "tsconfig.json"), "{}", "utf8");
    expect(detectProjectLanguage(tempDir)).toBe("typescript");
  });

  it("ensures JavaScript support does not alter TypeScript build behavior", () => {
    writeFileSync(
      join(tempDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext" } }),
      "utf8",
    );
    mkdirSync(join(tempDir, "src", "app", "ts-route"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "ts-route", "route.ts"),
      `export const GET = () => "from-ts";`,
      "utf8",
    );

    const stagingDir = manager.prepareStaging();
    const result = compileTypeScriptProject({ projectRoot: tempDir, stagingDir });

    expect(result.success).toBe(true);
    expect(existsSync(join(stagingDir, "src", "app", "ts-route", "route.js"))).toBe(true);
  });
});

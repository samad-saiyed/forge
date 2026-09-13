import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUILD_FORMAT_VERSION,
  BuildConfigError,
  BuildOutputManager,
  DEFAULT_CONFIG,
  formatBuildManifest,
  loadProductionBuildConfig,
  processJavaScriptProject,
  type BuildManifest,
} from "../../packages/core/src/index.js";

describe("Action 70.5 — Production Configuration Validation", { timeout: 15000 }, () => {
  let tempDir: string;
  let manager: BuildOutputManager;

  const validManifest: BuildManifest = {
    metadata: {
      formatVersion: BUILD_FORMAT_VERSION,
      forgeVersion: "0.1.0",
      builtAt: new Date().toISOString(),
      language: "javascript",
      configPath: "forge.config.js",
      appDir: "src/app",
    },
    routes: [],
  };

  beforeEach(() => {
    tempDir = join(tmpdir(), `forge-build-config-test-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ type: "module" }), "utf8");
    manager = new BuildOutputManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("loads and resolves valid JavaScript configuration for build pipeline", async () => {
    writeFileSync(
      join(tempDir, "forge.config.js"),
      `export default { server: { port: 8080, host: "0.0.0.0" } };`,
      "utf8",
    );

    const buildConfig = await loadProductionBuildConfig(tempDir);

    expect(buildConfig.language).toBe("javascript");
    expect(buildConfig.configFile).toBe("forge.config.js");
    expect(buildConfig.configPathRelative).toBe("forge.config.js");
    expect(buildConfig.resolvedConfig.server.port).toBe(8080);
    expect(buildConfig.resolvedConfig.server.host).toBe("0.0.0.0");
  });

  it("loads and resolves valid TypeScript configuration mapping to compiled js path", async () => {
    writeFileSync(join(tempDir, "tsconfig.json"), "{}", "utf8");
    writeFileSync(
      join(tempDir, "forge.config.ts"),
      `export default { server: { port: 9090 } };`,
      "utf8",
    );

    const buildConfig = await loadProductionBuildConfig(tempDir);

    expect(buildConfig.language).toBe("typescript");
    expect(buildConfig.configFile).toBe("forge.config.ts");
    expect(buildConfig.configPathRelative).toBe("forge.config.js");
    expect(buildConfig.resolvedConfig.server.port).toBe(9090);
  });

  it("uses default configuration when no config file is present", async () => {
    mkdirSync(join(tempDir, "src", "app"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "route.js"),
      `export const GET = () => "ok";`,
      "utf8",
    );

    const buildConfig = await loadProductionBuildConfig(tempDir);

    expect(buildConfig.configFile).toBe(null);
    expect(buildConfig.resolvedConfig).toEqual(DEFAULT_CONFIG);
  });

  it("throws BuildConfigError on invalid configuration shape or values", async () => {
    writeFileSync(
      join(tempDir, "forge.config.js"),
      `export default { server: { port: "not-a-number" } };`,
      "utf8",
    );

    await expect(loadProductionBuildConfig(tempDir)).rejects.toThrow(BuildConfigError);
  });

  it("surfaces underlying configuration module execution errors", async () => {
    writeFileSync(
      join(tempDir, "forge.config.js"),
      `throw new Error("Custom config evaluation failure");`,
      "utf8",
    );

    await expect(loadProductionBuildConfig(tempDir)).rejects.toThrow(
      /Custom config evaluation failure/,
    );
  });

  it("throws BuildConfigError when multiple configuration files exist", async () => {
    writeFileSync(join(tempDir, "forge.config.ts"), `export default {};`, "utf8");
    writeFileSync(join(tempDir, "forge.config.js"), `export default {};`, "utf8");

    await expect(loadProductionBuildConfig(tempDir)).rejects.toThrow(BuildConfigError);
  });

  it("preserves previous valid build when build configuration validation fails", async () => {
    // 1. Valid build finalized
    const stagingDir1 = manager.prepareStaging();
    writeFileSync(
      join(tempDir, "forge.config.js"),
      `export default { server: { port: 3000 } };`,
      "utf8",
    );
    mkdirSync(join(tempDir, "src", "app"), { recursive: true });
    writeFileSync(
      join(tempDir, "src", "app", "route.js"),
      `export const GET = () => "v1";`,
      "utf8",
    );

    processJavaScriptProject({ projectRoot: tempDir, stagingDir: stagingDir1 });
    writeFileSync(join(stagingDir1, "manifest.json"), formatBuildManifest(validManifest));
    manager.finalize();

    expect(manager.hasValidBuild()).toBe(true);

    // 2. Corrupt config for new build attempt
    writeFileSync(
      join(tempDir, "forge.config.js"),
      `export default { unknownOption: true };`,
      "utf8",
    );

    manager.prepareStaging();
    let buildFailed = false;

    try {
      await loadProductionBuildConfig(tempDir);
    } catch (err) {
      if (err instanceof BuildConfigError) {
        buildFailed = true;
        manager.discardStaging();
      }
    }

    expect(buildFailed).toBe(true);
    // Previous build remains untouched and valid
    expect(manager.hasValidBuild()).toBe(true);
    expect(existsSync(join(manager.finalDir, "src", "app", "route.js"))).toBe(true);
  });
});

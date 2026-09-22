import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUILD_FORMAT_VERSION,
  BUILD_OUTPUT_DIR,
  ProductionArtifactError,
  loadProductionApplication,
  startProductionServer,
  type BuildManifest,
} from "../../packages/core/src/index.js";

describe("ProductionRunner Unit & Artifact Validation Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `kyuu-prod-runner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("throws ProductionArtifactError if .kyuu/build/manifest.json does not exist", async () => {
    await expect(startProductionServer({ projectRoot: tempDir, skipListen: true })).rejects.toThrow(
      ProductionArtifactError,
    );
  });

  it("throws ProductionArtifactError if manifest formatVersion is unsupported", async () => {
    const buildDir = join(tempDir, BUILD_OUTPUT_DIR);
    mkdirSync(buildDir, { recursive: true });

    const invalidManifest: BuildManifest = {
      metadata: {
        formatVersion: "99.0",
        kyuuVersion: "0.1.0",
        builtAt: new Date().toISOString(),
        language: "typescript",
        configPath: "kyuu.config.js",
        appDir: "app",
      },
      routes: [],
    };

    writeFileSync(join(buildDir, "manifest.json"), JSON.stringify(invalidManifest, null, 2));

    await expect(loadProductionApplication({ projectRoot: tempDir })).rejects.toThrow(
      ProductionArtifactError,
    );
  });

  it("throws ProductionArtifactError if referenced route module does not exist on disk", async () => {
    const buildDir = join(tempDir, BUILD_OUTPUT_DIR);
    mkdirSync(buildDir, { recursive: true });

    const manifest: BuildManifest = {
      metadata: {
        formatVersion: BUILD_FORMAT_VERSION,
        kyuuVersion: "0.1.0",
        builtAt: new Date().toISOString(),
        language: "typescript",
        configPath: "kyuu.config.js",
        appDir: "app",
      },
      routes: [
        {
          method: "GET",
          pattern: "/missing",
          sourcePath: "src/app/missing/route.ts",
          modulePath: "app/missing/route.js",
        },
      ],
    };

    writeFileSync(join(buildDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    await expect(loadProductionApplication({ projectRoot: tempDir })).rejects.toThrow(
      ProductionArtifactError,
    );
  });

  it("throws ProductionArtifactError if route module does not export specified HTTP method", async () => {
    const buildDir = join(tempDir, BUILD_OUTPUT_DIR);
    const routeDir = join(buildDir, "app", "bad");
    mkdirSync(routeDir, { recursive: true });

    // Write module that exports POST instead of GET
    writeFileSync(join(routeDir, "route.js"), `export const POST = () => {};`);

    const manifest: BuildManifest = {
      metadata: {
        formatVersion: BUILD_FORMAT_VERSION,
        kyuuVersion: "0.1.0",
        builtAt: new Date().toISOString(),
        language: "typescript",
        configPath: "kyuu.config.js",
        appDir: "app",
      },
      routes: [
        {
          method: "GET",
          pattern: "/bad",
          sourcePath: "src/app/bad/route.ts",
          modulePath: "app/bad/route.js",
        },
      ],
    };

    writeFileSync(join(buildDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    await expect(loadProductionApplication({ projectRoot: tempDir })).rejects.toThrow(
      ProductionArtifactError,
    );
  });
});

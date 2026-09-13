import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ArtifactValidationError,
  BUILD_FORMAT_VERSION,
  BUILD_OUTPUT_DIR,
  BuildOrchestrator,
  buildProject,
  parseBuildManifest,
  validateStagingArtifact,
  type BuildManifest,
} from "../../packages/core/src/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("BuildOrchestrator Unit & Artifact Validation Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `forge-orchestrator-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Artifact Validation", () => {
    it("validates valid staging artifact without throwing", () => {
      const stagingDir = join(tempDir, "staging");
      const appDir = join(stagingDir, "app", "api");
      mkdirSync(appDir, { recursive: true });
      writeFileSync(join(appDir, "route.js"), `export const GET = () => {};`, "utf8");

      const manifest: BuildManifest = {
        metadata: {
          formatVersion: BUILD_FORMAT_VERSION,
          forgeVersion: "0.1.0",
          builtAt: new Date().toISOString(),
          language: "typescript",
          configPath: "forge.config.js",
          appDir: "app",
        },
        routes: [
          {
            method: "GET",
            pattern: "/api",
            sourcePath: "src/app/api/route.ts",
            modulePath: "app/api/route.js",
          },
        ],
      };

      expect(() => validateStagingArtifact(stagingDir, manifest)).not.toThrow();
    });

    it("throws ArtifactValidationError if formatVersion is unsupported", () => {
      const manifest: BuildManifest = {
        metadata: {
          formatVersion: "99.0",
          forgeVersion: "0.1.0",
          builtAt: new Date().toISOString(),
          language: "typescript",
          configPath: "forge.config.js",
          appDir: "app",
        },
        routes: [],
      };

      expect(() => validateStagingArtifact(tempDir, manifest)).toThrow(ArtifactValidationError);
    });

    it("throws ArtifactValidationError if referenced route module file does not exist", () => {
      const manifest: BuildManifest = {
        metadata: {
          formatVersion: BUILD_FORMAT_VERSION,
          forgeVersion: "0.1.0",
          builtAt: new Date().toISOString(),
          language: "typescript",
          configPath: "forge.config.js",
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

      expect(() => validateStagingArtifact(tempDir, manifest)).toThrow(ArtifactValidationError);
    });

    it("throws ArtifactValidationError if route module path attempts path traversal", () => {
      const manifest: BuildManifest = {
        metadata: {
          formatVersion: BUILD_FORMAT_VERSION,
          forgeVersion: "0.1.0",
          builtAt: new Date().toISOString(),
          language: "typescript",
          configPath: "forge.config.js",
          appDir: "app",
        },
        routes: [
          {
            method: "GET",
            pattern: "/unsafe",
            sourcePath: "src/app/unsafe/route.ts",
            modulePath: "../outside.js",
          },
        ],
      };

      expect(() => validateStagingArtifact(tempDir, manifest)).toThrow(ArtifactValidationError);
    });
  });

  describe("BuildOrchestrator Execution", () => {
    it("successfully orchestrates a TypeScript build end-to-end", async () => {
      writeFileSync(
        join(tempDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext" } }),
      );
      writeFileSync(join(tempDir, "forge.config.ts"), `export default {};`);
      mkdirSync(join(tempDir, "src", "app", "api"), { recursive: true });
      writeFileSync(
        join(tempDir, "src", "app", "api", "route.ts"),
        `export const GET = () => "hello";`,
      );

      const orchestrator = new BuildOrchestrator({ projectRoot: tempDir });
      const result = await orchestrator.build();

      expect(result.language).toBe("typescript");
      expect(result.buildDir).toBe(join(tempDir, BUILD_OUTPUT_DIR));
      expect(existsSync(join(result.buildDir, "manifest.json"))).toBe(true);

      const manifestContent = readFileSync(join(result.buildDir, "manifest.json"), "utf8");
      const manifest = parseBuildManifest(manifestContent);

      expect(manifest.metadata.language).toBe("typescript");
      expect(manifest.routes).toHaveLength(1);
      expect(manifest.routes[0].pattern).toBe("/api");
      const moduleFileOnDisk = existsSync(join(result.buildDir, manifest.routes[0].modulePath))
        ? join(result.buildDir, manifest.routes[0].modulePath)
        : join(result.buildDir, "src", manifest.routes[0].modulePath);
      expect(existsSync(moduleFileOnDisk)).toBe(true);
    });

    it("buildProject helper builds successfully", async () => {
      writeFileSync(join(tempDir, "forge.config.js"), `export default {};`);
      mkdirSync(join(tempDir, "src", "app"), { recursive: true });
      writeFileSync(join(tempDir, "src", "app", "route.js"), `export const GET = () => "ok";`);

      const result = await buildProject(tempDir);
      expect(result.language).toBe("javascript");
      expect(existsSync(join(result.buildDir, "manifest.json"))).toBe(true);
    });
  });
});

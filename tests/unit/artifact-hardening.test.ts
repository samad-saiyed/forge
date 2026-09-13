import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ArtifactValidationError,
  BUILD_FORMAT_VERSION,
  BuildOrchestrator,
  BuildOutputManager,
  generateBuildManifest,
  loadProductionApplication,
  validateStagingArtifact,
  type BuildManifest,
} from "../../packages/core/src/index.js";

describe("Action 70.10 — Artifact Hardening & Validation Unit Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `forge-artifact-unit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("1. Artifact Validation", () => {
    it("throws ArtifactValidationError when format version is unsupported", () => {
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

      expect(() => validateStagingArtifact(tempDir, manifest)).toThrowError(
        ArtifactValidationError,
      );
      expect(() => validateStagingArtifact(tempDir, manifest)).toThrowError(
        "Unsupported build format version '99.0'",
      );
    });

    it("throws ArtifactValidationError when metadata configPath is empty", () => {
      const manifest: BuildManifest = {
        metadata: {
          formatVersion: BUILD_FORMAT_VERSION,
          forgeVersion: "0.1.0",
          builtAt: new Date().toISOString(),
          language: "typescript",
          configPath: "",
          appDir: "app",
        },
        routes: [],
      };

      expect(() => validateStagingArtifact(tempDir, manifest)).toThrowError(
        ArtifactValidationError,
      );
      expect(() => validateStagingArtifact(tempDir, manifest)).toThrowError(
        "metadata 'configPath' is missing or empty",
      );
    });

    it("throws ArtifactValidationError when metadata appDir path is not a directory", () => {
      // Create a file instead of directory at appDir location
      writeFileSync(join(tempDir, "app"), "not a directory");

      const manifest: BuildManifest = {
        metadata: {
          formatVersion: BUILD_FORMAT_VERSION,
          forgeVersion: "0.1.0",
          builtAt: new Date().toISOString(),
          language: "typescript",
          configPath: "forge.config.js",
          appDir: "app",
        },
        routes: [],
      };

      expect(() => validateStagingArtifact(tempDir, manifest)).toThrowError(
        ArtifactValidationError,
      );
      expect(() => validateStagingArtifact(tempDir, manifest)).toThrowError("is not a directory");
    });

    it("throws ArtifactValidationError when route modulePath performs path traversal", () => {
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
            pattern: "/secret",
            sourcePath: "src/app/secret.ts",
            modulePath: "../../../etc/passwd",
          },
        ],
      };

      expect(() => validateStagingArtifact(tempDir, manifest)).toThrowError(
        ArtifactValidationError,
      );
      expect(() => validateStagingArtifact(tempDir, manifest)).toThrowError(
        "Module paths must be relative to the build directory",
      );
    });

    it("throws ArtifactValidationError when route module file does not exist", () => {
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
            sourcePath: "src/app/missing.ts",
            modulePath: "app/missing.js",
          },
        ],
      };

      expect(() => validateStagingArtifact(tempDir, manifest)).toThrowError(
        ArtifactValidationError,
      );
      expect(() => validateStagingArtifact(tempDir, manifest)).toThrowError(
        "references compiled module 'app/missing.js' which does not exist",
      );
    });
  });

  describe("2. Determinism & Reproducibility", () => {
    it("sorts routes deterministically by pattern then method", async () => {
      const stagingDir = join(tempDir, "staging");
      mkdirSync(stagingDir, { recursive: true });

      // Create fake module files for routes
      mkdirSync(join(stagingDir, "app", "users"), { recursive: true });
      mkdirSync(join(stagingDir, "app", "auth"), { recursive: true });
      writeFileSync(join(stagingDir, "app", "users", "route.js"), "export const GET = () => {};");
      writeFileSync(join(stagingDir, "app", "auth", "route.js"), "export const POST = () => {};");

      const unorderedRoutes = [
        {
          method: "POST",
          pattern: "/users",
          sourcePath: "src/app/users/route.ts",
          modulePath: "app/users/route.js",
        },
        {
          method: "GET",
          pattern: "/users",
          sourcePath: "src/app/users/route.ts",
          modulePath: "app/users/route.js",
        },
        {
          method: "POST",
          pattern: "/auth",
          sourcePath: "src/app/auth/route.ts",
          modulePath: "app/auth/route.js",
        },
      ];

      const manifest1 = await generateBuildManifest({
        projectRoot: tempDir,
        stagingDir,
        language: "typescript",
        configPathRelative: "forge.config.js",
        routes: unorderedRoutes,
      });

      const manifest2 = await generateBuildManifest({
        projectRoot: tempDir,
        stagingDir,
        language: "typescript",
        configPathRelative: "forge.config.js",
        routes: [...unorderedRoutes].reverse(),
      });

      expect(manifest1.routes).toEqual(manifest2.routes);
      expect(manifest1.routes[0].pattern).toBe("/auth");
      expect(manifest1.routes[1].pattern).toBe("/users");
      expect(manifest1.routes[1].method).toBe("GET");
      expect(manifest1.routes[2].pattern).toBe("/users");
      expect(manifest1.routes[2].method).toBe("POST");
    });
  });

  describe("3. Stale Artifact Protection", () => {
    it(
      "preserves previous valid build artifact when a subsequent build fails",
      { timeout: 30000 },
      async () => {
        // 1. Perform successful initial build
        writeFileSync(
          join(tempDir, "tsconfig.json"),
          JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext" } }),
        );
        writeFileSync(join(tempDir, "forge.config.ts"), "export default {};");
        mkdirSync(join(tempDir, "src", "app", "v1"), { recursive: true });
        writeFileSync(
          join(tempDir, "src", "app", "v1", "route.ts"),
          "export const GET = (_req: any, res: any) => { res.json({ v: 1 }); };",
        );

        const orchestrator1 = new BuildOrchestrator({ projectRoot: tempDir });
        const result1 = await orchestrator1.build();
        expect(result1.manifest.routes).toHaveLength(1);

        // Verify startup works for initial build
        const loaded1 = await loadProductionApplication({ projectRoot: tempDir, skipListen: true });
        expect(loaded1.manifest.routes[0].pattern).toBe("/v1");

        // 2. Introduce a syntax error into source to make compilation fail
        writeFileSync(join(tempDir, "src", "app", "v1", "route.ts"), "INVALID TS SYNTAX {{{");

        const orchestrator2 = new BuildOrchestrator({ projectRoot: tempDir });
        await expect(orchestrator2.build()).rejects.toThrow();

        // 3. Confirm previous valid build in .forge/build remains valid and intact!
        const outputManager = new BuildOutputManager(tempDir);
        expect(outputManager.hasValidBuild()).toBe(true);

        const loaded2 = await loadProductionApplication({ projectRoot: tempDir, skipListen: true });
        expect(loaded2.manifest.routes[0].pattern).toBe("/v1");
      },
    );
  });
});

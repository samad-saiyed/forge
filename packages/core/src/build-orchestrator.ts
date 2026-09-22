import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { loadProductionBuildConfig } from "./build-config.js";
import { generateBuildManifest } from "./build-manifest.js";
import { discoverBuildRouteEntries } from "./build-routes.js";
import { BUILD_FORMAT_VERSION, BuildOutputManager, type BuildManifest } from "./build.js";
import { compileTypeScriptProject } from "./compiler.js";
import { processJavaScriptProject } from "./js-builder.js";

export interface BuildOptions {
  /** Root directory of the Kyuu project to build */
  projectRoot: string;
}

export interface BuildResult {
  /** Resolved project root directory */
  projectRoot: string;
  /** Final build output directory path (.kyuu/build) */
  buildDir: string;
  /** Project language detected for the build ("typescript" | "javascript") */
  language: "typescript" | "javascript";
  /** Validated build manifest generated for the build */
  manifest: BuildManifest;
}

export class ArtifactValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ArtifactValidationError";
  }
}

/**
 * Validates that the staging build directory contains a complete, valid, and self-contained artifact.
 */
export function validateStagingArtifact(stagingDir: string, manifest: BuildManifest): void {
  const staging = resolve(stagingDir);

  if (manifest.metadata.formatVersion !== BUILD_FORMAT_VERSION) {
    throw new ArtifactValidationError(
      `Unsupported build format version '${manifest.metadata.formatVersion}'. Expected '${BUILD_FORMAT_VERSION}'.`,
    );
  }

  if (!manifest.metadata.configPath || manifest.metadata.configPath.trim() === "") {
    throw new ArtifactValidationError("Build metadata 'configPath' is missing or empty.");
  }

  if (!manifest.metadata.appDir || manifest.metadata.appDir.trim() === "") {
    throw new ArtifactValidationError("Build metadata 'appDir' is missing or empty.");
  }

  // Verify compiled application directory exists if appDir is specified
  const appPath = join(staging, manifest.metadata.appDir);
  if (existsSync(appPath)) {
    const stat = statSync(appPath);
    if (!stat.isDirectory()) {
      throw new ArtifactValidationError(
        `Build artifact path '${manifest.metadata.appDir}' is not a directory.`,
      );
    }
  }

  // Verify every route entry references an existing module path within the staging artifact
  for (let i = 0; i < manifest.routes.length; i++) {
    const route = manifest.routes[i];

    if (isAbsolute(route.modulePath) || route.modulePath.startsWith("..")) {
      throw new ArtifactValidationError(
        `Route module path '${route.modulePath}' at index ${i} is invalid. Module paths must be relative to the build directory.`,
      );
    }

    let moduleFile = join(staging, route.modulePath);
    if (!existsSync(moduleFile) && existsSync(join(staging, "src", route.modulePath))) {
      moduleFile = join(staging, "src", route.modulePath);
    }

    if (!existsSync(moduleFile)) {
      throw new ArtifactValidationError(
        `Route '${route.pattern}' [${route.method}] references compiled module '${route.modulePath}' which does not exist in staging output.`,
      );
    }

    const stat = statSync(moduleFile);
    if (!stat.isFile()) {
      throw new ArtifactValidationError(
        `Route '${route.pattern}' [${route.method}] module path '${route.modulePath}' is not a file.`,
      );
    }
  }
}

/**
 * Core build orchestrator coordinating project configuration, compilation, route discovery,
 * manifest generation, artifact validation, and atomic finalization.
 */
export class BuildOrchestrator {
  readonly projectRoot: string;
  readonly outputManager: BuildOutputManager;

  constructor(options: BuildOptions) {
    this.projectRoot = resolve(options.projectRoot);
    this.outputManager = new BuildOutputManager(this.projectRoot);
  }

  /**
   * Executes the full production build pipeline for the project.
   */
  async build(): Promise<BuildResult> {
    this.outputManager.acquireLock();
    let stagingDir: string | null = null;

    try {
      // 1. Prepare clean staging output directory
      stagingDir = this.outputManager.prepareStaging();

      // 2. Load production build configuration and detect project language
      const buildConfig = await loadProductionBuildConfig(this.projectRoot);

      // 3. Compile or prepare application source into staging directory
      if (buildConfig.language === "typescript") {
        compileTypeScriptProject({
          projectRoot: this.projectRoot,
          stagingDir,
        });
      } else {
        processJavaScriptProject({
          projectRoot: this.projectRoot,
          stagingDir,
        });
      }

      // 4. Discover production filesystem route entries from staging compiled output
      const routes = await discoverBuildRouteEntries({
        projectRoot: this.projectRoot,
        stagingDir,
        language: buildConfig.language,
      });

      // 5. Generate and write build manifest.json into staging directory
      const manifest = await generateBuildManifest({
        projectRoot: this.projectRoot,
        stagingDir,
        language: buildConfig.language,
        configPathRelative: buildConfig.configPathRelative,
        routes,
      });

      // 6. Validate complete staging build artifact
      validateStagingArtifact(stagingDir, manifest);

      // Verify manifest.json can be re-parsed from disk
      const stagingManifestFile = join(stagingDir, "manifest.json");
      if (!existsSync(stagingManifestFile)) {
        throw new ArtifactValidationError(
          "Manifest file 'manifest.json' was not found in staging output.",
        );
      }

      // 7. Promote staging output atomically to final build directory (.kyuu/build)
      const finalDir = this.outputManager.finalize();

      return {
        projectRoot: this.projectRoot,
        buildDir: finalDir,
        language: buildConfig.language,
        manifest,
      };
    } catch (err) {
      if (stagingDir) {
        this.outputManager.discardStaging();
      }
      throw err;
    } finally {
      this.outputManager.releaseLock();
    }
  }
}

/**
 * Convenience helper to build a Kyuu project for production using BuildOrchestrator.
 */
export async function buildProject(options: BuildOptions | string): Promise<BuildResult> {
  const opts: BuildOptions = typeof options === "string" ? { projectRoot: options } : options;
  const orchestrator = new BuildOrchestrator(opts);
  return orchestrator.build();
}

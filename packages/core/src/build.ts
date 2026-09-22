import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

/**
 * Default relative directory path for production build artifacts.
 */
export const BUILD_OUTPUT_DIR = ".kyuu/build";

/**
 * Default relative directory path for staging atomic builds.
 */
export const BUILD_STAGING_DIR = ".kyuu/build-staging";

/**
 * Current version of the Kyuu build artifact format.
 */
export const BUILD_FORMAT_VERSION = "1.0";

/**
 * Strongly typed representation of build metadata stored in manifest.json.
 */
export interface BuildMetadata {
  /** Build format version for compatibility checking (e.g. "1.0") */
  formatVersion: string;
  /** Framework version used to create the build */
  kyuuVersion: string;
  /** ISO 8601 timestamp of build completion */
  builtAt: string;
  /** Target project language */
  language: "typescript" | "javascript";
  /** Project-relative path to compiled config file (e.g. "kyuu.config.js") */
  configPath: string;
  /** Project-relative path to compiled application directory (e.g. "app") */
  appDir: string;
}

/**
 * Strongly typed representation of a single route entry in the build manifest.
 */
export interface BuildRouteEntry {
  /** HTTP method or verb (e.g. "GET", "POST", "ALL") */
  method: string;
  /** Resolved HTTP route pattern (e.g. "/users", "/users/:id", "/files/*filepath") */
  pattern: string;
  /** POSIX project-relative source file path (e.g. "src/app/users/[id]/route.ts") */
  sourcePath: string;
  /** POSIX build-relative compiled module path (e.g. "app/users/[id]/route.js") */
  modulePath: string;
}

/**
 * Complete production build manifest (.kyuu/build/manifest.json).
 */
export interface BuildManifest {
  metadata: BuildMetadata;
  routes: BuildRouteEntry[];
}

/**
 * Returns the absolute path to the production build output directory.
 */
export function getBuildDir(projectRoot: string): string {
  return join(projectRoot, BUILD_OUTPUT_DIR);
}

/**
 * Returns the absolute path to the temporary atomic staging build directory.
 */
export function getStagingBuildDir(projectRoot: string): string {
  return join(projectRoot, BUILD_STAGING_DIR);
}

/**
 * Returns the absolute path to the build manifest.json file.
 */
export function getManifestPath(projectRoot: string): string {
  return join(getBuildDir(projectRoot), "manifest.json");
}

/**
 * Normalizes a path to POSIX style (forward slashes) for machine-independent manifests.
 */
export function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

/**
 * Maps a project-relative source path (e.g. "src/app/users/route.ts") to its build output path.
 */
export function mapSourceToBuildPath(
  sourcePath: string,
  language: "typescript" | "javascript",
): string {
  const normalized = toPosixPath(sourcePath);
  let target = normalized;
  if (target.startsWith("src/")) {
    target = target.slice(4);
  }

  if (language === "typescript") {
    if (target.endsWith(".ts")) {
      target = target.slice(0, -3) + ".js";
    } else if (target.endsWith(".tsx")) {
      target = target.slice(0, -4) + ".js";
    }
  }

  return toPosixPath(target);
}

/**
 * Validates the structure and required fields of a BuildManifest object.
 */
export function validateBuildManifest(manifest: unknown): asserts manifest is BuildManifest {
  if (manifest === null || typeof manifest !== "object") {
    throw new TypeError("Build manifest must be a non-null object.");
  }

  const obj = manifest as Record<string, unknown>;

  if (!obj.metadata || typeof obj.metadata !== "object" || obj.metadata === null) {
    throw new TypeError("Build manifest must contain a 'metadata' object.");
  }

  const meta = obj.metadata as Record<string, unknown>;

  if (typeof meta.formatVersion !== "string" || meta.formatVersion.trim() === "") {
    throw new TypeError("Build metadata 'formatVersion' must be a non-empty string.");
  }

  if (typeof meta.kyuuVersion !== "string" || meta.kyuuVersion.trim() === "") {
    throw new TypeError("Build metadata 'kyuuVersion' must be a non-empty string.");
  }

  if (typeof meta.builtAt !== "string" || isNaN(Date.parse(meta.builtAt))) {
    throw new TypeError("Build metadata 'builtAt' must be a valid ISO date string.");
  }

  if (meta.language !== "typescript" && meta.language !== "javascript") {
    throw new TypeError("Build metadata 'language' must be 'typescript' or 'javascript'.");
  }

  if (typeof meta.configPath !== "string" || meta.configPath.trim() === "") {
    throw new TypeError("Build metadata 'configPath' must be a non-empty string.");
  }

  if (typeof meta.appDir !== "string" || meta.appDir.trim() === "") {
    throw new TypeError("Build metadata 'appDir' must be a non-empty string.");
  }

  if (!Array.isArray(obj.routes)) {
    throw new TypeError("Build manifest must contain a 'routes' array.");
  }

  for (let i = 0; i < obj.routes.length; i++) {
    const route = obj.routes[i] as Record<string, unknown>;
    if (!route || typeof route !== "object") {
      throw new TypeError(`Build route entry at index ${i} must be an object.`);
    }
    if (typeof route.method !== "string" || route.method.trim() === "") {
      throw new TypeError(`Build route entry at index ${i} must have a non-empty 'method'.`);
    }
    if (typeof route.pattern !== "string" || route.pattern.trim() === "") {
      throw new TypeError(`Build route entry at index ${i} must have a non-empty 'pattern'.`);
    }
    if (typeof route.sourcePath !== "string" || route.sourcePath.trim() === "") {
      throw new TypeError(`Build route entry at index ${i} must have a non-empty 'sourcePath'.`);
    }
    if (typeof route.modulePath !== "string" || route.modulePath.trim() === "") {
      throw new TypeError(`Build route entry at index ${i} must have a non-empty 'modulePath'.`);
    }
  }
}

/**
 * Creates and formats a JSON string representation of a BuildManifest.
 */
export function formatBuildManifest(manifest: BuildManifest): string {
  validateBuildManifest(manifest);
  return JSON.stringify(manifest, null, 2) + "\n";
}

/**
 * Parses and validates a JSON string into a BuildManifest.
 */
export function parseBuildManifest(jsonContent: string): BuildManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (err) {
    throw new Error(
      `Failed to parse build manifest JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  validateBuildManifest(parsed);
  return parsed;
}

/**
 * Filesystem output manager responsible for atomic build operations and staging lifecycle.
 */
export class BuildOutputManager {
  readonly projectRoot: string;
  readonly kyuuDir: string;
  readonly finalDir: string;
  readonly stagingDir: string;
  readonly lockFilePath: string;

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
    this.kyuuDir = join(this.projectRoot, ".kyuu");
    this.finalDir = join(this.projectRoot, BUILD_OUTPUT_DIR);
    this.stagingDir = join(this.projectRoot, BUILD_STAGING_DIR);
    this.lockFilePath = join(this.kyuuDir, ".build.lock");
  }

  /**
   * Prepares a clean staging directory for a new build operation.
   * Cleans any stale staging artifacts.
   */
  prepareStaging(): string {
    mkdirSync(this.kyuuDir, { recursive: true });
    if (existsSync(this.stagingDir)) {
      rmSync(this.stagingDir, { recursive: true, force: true });
    }
    mkdirSync(this.stagingDir, { recursive: true });
    return this.stagingDir;
  }

  /**
   * Cleans up the staging directory when a build fails or aborts.
   */
  discardStaging(): void {
    if (existsSync(this.stagingDir)) {
      rmSync(this.stagingDir, { recursive: true, force: true });
    }
  }

  /**
   * Atomically promotes the staging directory to the final build directory.
   * Ensures previous build is preserved if promotion fails.
   */
  finalize(): string {
    const stagingManifestPath = join(this.stagingDir, "manifest.json");
    if (!existsSync(stagingManifestPath)) {
      throw new Error(
        `Cannot finalize build: Staging directory '${this.stagingDir}' does not contain manifest.json.`,
      );
    }

    // Validate staging manifest before promoting
    const manifestContent = readFileSync(stagingManifestPath, "utf8");
    parseBuildManifest(manifestContent);

    const backupDir = join(
      this.kyuuDir,
      `build-backup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );

    let hasBackup = false;

    if (existsSync(this.finalDir)) {
      renameSync(this.finalDir, backupDir);
      hasBackup = true;
    }

    try {
      renameSync(this.stagingDir, this.finalDir);
      if (hasBackup && existsSync(backupDir)) {
        rmSync(backupDir, { recursive: true, force: true });
      }
      return this.finalDir;
    } catch (err) {
      // Rollback: restore backup if rename failed
      if (hasBackup && existsSync(backupDir)) {
        if (existsSync(this.finalDir)) {
          rmSync(this.finalDir, { recursive: true, force: true });
        }
        renameSync(backupDir, this.finalDir);
      }
      throw err;
    }
  }

  /**
   * Returns true if a valid final build exists (manifest.json exists and parses cleanly).
   */
  hasValidBuild(): boolean {
    const manifestPath = getManifestPath(this.projectRoot);
    if (!existsSync(manifestPath)) {
      return false;
    }
    try {
      const content = readFileSync(manifestPath, "utf8");
      parseBuildManifest(content);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolves a path inside the staging directory and verifies path traversal safety.
   */
  resolveStagingPath(relativePath: string): string {
    const posix = toPosixPath(relativePath);
    const target = resolve(this.stagingDir, posix);
    const rel = relative(this.stagingDir, target);

    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(`Path traversal attempt detected outside build directory: '${relativePath}'`);
    }

    return target;
  }

  /**
   * Acquires the build lock file to prevent concurrent build operations.
   */
  acquireLock(): void {
    mkdirSync(this.kyuuDir, { recursive: true });
    if (existsSync(this.lockFilePath)) {
      try {
        const lockContent = readFileSync(this.lockFilePath, "utf8");
        const lockData = JSON.parse(lockContent) as { pid?: number };
        if (lockData.pid) {
          try {
            process.kill(lockData.pid, 0);
            throw new Error(`Another build process (PID ${lockData.pid}) is currently running.`);
          } catch (e) {
            if ((e as { code?: string }).code === "ESRCH") {
              // Process dead, remove stale lock
              rmSync(this.lockFilePath, { force: true });
            } else {
              throw e;
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes("Another build process")) {
          throw err;
        }
        rmSync(this.lockFilePath, { force: true });
      }
    }

    const lockData = { pid: process.pid, createdAt: new Date().toISOString() };
    writeFileSync(this.lockFilePath, JSON.stringify(lockData, null, 2), "utf8");
  }

  /**
   * Releases the build lock file.
   */
  releaseLock(): void {
    if (existsSync(this.lockFilePath)) {
      try {
        rmSync(this.lockFilePath, { force: true });
      } catch {
        // Ignore removal error
      }
    }
  }
}

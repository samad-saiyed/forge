import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUILD_FORMAT_VERSION,
  BuildOutputManager,
  formatBuildManifest,
  type BuildManifest,
} from "../../packages/core/src/index.js";

describe("Action 70.2 — Build Output Management", () => {
  let tempDir: string;
  let manager: BuildOutputManager;

  const validManifest: BuildManifest = {
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
        pattern: "/health",
        sourcePath: "src/app/health/route.ts",
        modulePath: "app/health/route.js",
      },
    ],
  };

  beforeEach(() => {
    tempDir = join(tmpdir(), `kyuu-build-output-test-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
    manager = new BuildOutputManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates staging directory on prepareStaging", () => {
    expect(existsSync(manager.stagingDir)).toBe(false);
    const staging = manager.prepareStaging();
    expect(staging).toBe(manager.stagingDir);
    expect(existsSync(staging)).toBe(true);
  });

  it("promotes valid staging directory to final build directory on finalize", () => {
    manager.prepareStaging();
    writeFileSync(join(manager.stagingDir, "manifest.json"), formatBuildManifest(validManifest));
    writeFileSync(join(manager.stagingDir, "dummy.js"), "console.log('hello');");

    expect(manager.hasValidBuild()).toBe(false);

    const resultDir = manager.finalize();
    expect(resultDir).toBe(manager.finalDir);
    expect(existsSync(manager.finalDir)).toBe(true);
    expect(existsSync(join(manager.finalDir, "manifest.json"))).toBe(true);
    expect(existsSync(join(manager.finalDir, "dummy.js"))).toBe(true);
    expect(manager.hasValidBuild()).toBe(true);
  });

  it("preserves previous valid build when new build fails and staging is discarded", () => {
    // 1. Initial valid build
    manager.prepareStaging();
    writeFileSync(join(manager.stagingDir, "manifest.json"), formatBuildManifest(validManifest));
    writeFileSync(join(manager.stagingDir, "v1.js"), "v1");
    manager.finalize();

    expect(existsSync(join(manager.finalDir, "v1.js"))).toBe(true);

    // 2. New build starts but fails
    manager.prepareStaging();
    writeFileSync(join(manager.stagingDir, "v2.js"), "v2");
    // Build fails before finalization -> discard staging
    manager.discardStaging();

    // Previous build survives!
    expect(existsSync(manager.finalDir)).toBe(true);
    expect(existsSync(join(manager.finalDir, "v1.js"))).toBe(true);
    expect(existsSync(manager.stagingDir)).toBe(false);
    expect(manager.hasValidBuild()).toBe(true);
  });

  it("leaves no fake build directory on first-build failure", () => {
    manager.prepareStaging();
    writeFileSync(join(manager.stagingDir, "partial.js"), "incomplete");
    manager.discardStaging();

    expect(existsSync(manager.finalDir)).toBe(false);
    expect(existsSync(manager.stagingDir)).toBe(false);
    expect(manager.hasValidBuild()).toBe(false);
  });

  it("removes stale files from previous build upon replacement", () => {
    // Build 1 generates users.js, posts.js, health.js
    manager.prepareStaging();
    writeFileSync(join(manager.stagingDir, "manifest.json"), formatBuildManifest(validManifest));
    writeFileSync(join(manager.stagingDir, "users.js"), "users");
    writeFileSync(join(manager.stagingDir, "posts.js"), "posts");
    writeFileSync(join(manager.stagingDir, "health.js"), "health");
    manager.finalize();

    expect(existsSync(join(manager.finalDir, "posts.js"))).toBe(true);

    // Build 2 removes posts.js
    manager.prepareStaging();
    writeFileSync(join(manager.stagingDir, "manifest.json"), formatBuildManifest(validManifest));
    writeFileSync(join(manager.stagingDir, "users.js"), "users-v2");
    writeFileSync(join(manager.stagingDir, "health.js"), "health-v2");
    manager.finalize();

    // posts.js must NOT survive from previous build
    expect(existsSync(join(manager.finalDir, "users.js"))).toBe(true);
    expect(existsSync(join(manager.finalDir, "health.js"))).toBe(true);
    expect(existsSync(join(manager.finalDir, "posts.js"))).toBe(false);
  });

  it("protects unrelated project files from deletion during build operations", () => {
    // Setup unrelated project files
    writeFileSync(join(tempDir, "important.txt"), "DO NOT DELETE");
    mkdirSync(join(tempDir, "src"), { recursive: true });
    writeFileSync(join(tempDir, "src", "app.ts"), "code");

    manager.prepareStaging();
    writeFileSync(join(manager.stagingDir, "manifest.json"), formatBuildManifest(validManifest));
    manager.finalize();

    // Verify unrelated project files are untouched
    expect(readFileSync(join(tempDir, "important.txt"), "utf8")).toBe("DO NOT DELETE");
    expect(readFileSync(join(tempDir, "src", "app.ts"), "utf8")).toBe("code");
  });

  it("rejects path traversal attempts outside build staging directory", () => {
    manager.prepareStaging();
    expect(() => manager.resolveStagingPath("../../../outside.txt")).toThrow(
      "Path traversal attempt",
    );
  });

  it("handles concurrency locking cleanly", () => {
    // Acquire lock
    manager.acquireLock();
    expect(existsSync(manager.lockFilePath)).toBe(true);

    // Second manager attempting lock should detect current running process
    const secondManager = new BuildOutputManager(tempDir);
    expect(() => secondManager.acquireLock()).toThrow("Another build process");

    // Release lock
    manager.releaseLock();
    expect(existsSync(manager.lockFilePath)).toBe(false);

    // Now second manager can acquire lock
    expect(() => secondManager.acquireLock()).not.toThrow();
    secondManager.releaseLock();
  });

  it("keeps only latest build across repeated successful builds", () => {
    for (let i = 1; i <= 3; i++) {
      manager.prepareStaging();
      writeFileSync(join(manager.stagingDir, "manifest.json"), formatBuildManifest(validManifest));
      writeFileSync(join(manager.stagingDir, `build-${i}.js`), `build-${i}`);
      manager.finalize();
    }

    expect(existsSync(join(manager.finalDir, "build-3.js"))).toBe(true);
    expect(existsSync(join(manager.finalDir, "build-1.js"))).toBe(false);
    expect(existsSync(join(manager.finalDir, "build-2.js"))).toBe(false);
  });
});

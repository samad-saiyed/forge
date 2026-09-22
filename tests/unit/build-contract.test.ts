import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILD_FORMAT_VERSION,
  BUILD_OUTPUT_DIR,
  BUILD_STAGING_DIR,
  formatBuildManifest,
  getBuildDir,
  getManifestPath,
  getStagingBuildDir,
  mapSourceToBuildPath,
  parseBuildManifest,
  toPosixPath,
  validateBuildManifest,
  type BuildManifest,
} from "../../packages/core/src/index.js";

describe("Action 70.1 — Production Build Contract", () => {
  const sampleManifest: BuildManifest = {
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
        pattern: "/users",
        sourcePath: "src/app/users/route.ts",
        modulePath: "app/users/route.js",
      },
      {
        method: "GET",
        pattern: "/users/:id",
        sourcePath: "src/app/users/[id]/route.ts",
        modulePath: "app/users/[id]/route.js",
      },
    ],
  };

  it("defines standard build output directory paths", () => {
    const root = "/project/root";
    expect(BUILD_OUTPUT_DIR).toBe(".kyuu/build");
    expect(BUILD_STAGING_DIR).toBe(".kyuu/build-staging");
    expect(getBuildDir(root)).toBe(join(root, ".kyuu/build"));
    expect(getStagingBuildDir(root)).toBe(join(root, ".kyuu/build-staging"));
    expect(getManifestPath(root)).toBe(join(root, ".kyuu/build/manifest.json"));
  });

  it("normalizes paths to POSIX slashes for machine independence", () => {
    expect(toPosixPath("src\\app\\users\\route.ts")).toBe("src/app/users/route.ts");
    expect(toPosixPath("src/app/users/route.ts")).toBe("src/app/users/route.ts");
  });

  it("maps source relative paths to production output paths", () => {
    expect(mapSourceToBuildPath("src/app/users/route.ts", "typescript")).toBe("app/users/route.js");
    expect(mapSourceToBuildPath("src/app/users/[id]/route.ts", "typescript")).toBe(
      "app/users/[id]/route.js",
    );
    expect(mapSourceToBuildPath("src/app/products/route.js", "javascript")).toBe(
      "app/products/route.js",
    );
    expect(mapSourceToBuildPath("kyuu.config.ts", "typescript")).toBe("kyuu.config.js");
  });

  it("formats and parses valid BuildManifest objects", () => {
    const formatted = formatBuildManifest(sampleManifest);
    expect(formatted).toContain(`"formatVersion": "${BUILD_FORMAT_VERSION}"`);
    expect(formatted).toContain('"pattern": "/users/:id"');

    const parsed = parseBuildManifest(formatted);
    expect(parsed).toEqual(sampleManifest);
  });

  it("validates BuildManifest schema strictly", () => {
    expect(() => validateBuildManifest(null)).toThrow(TypeError);
    expect(() => validateBuildManifest({})).toThrow(TypeError);

    // Invalid builtAt
    const invalidDate = {
      ...sampleManifest,
      metadata: { ...sampleManifest.metadata, builtAt: "invalid-date" },
    };
    expect(() => validateBuildManifest(invalidDate)).toThrow(TypeError);

    // Invalid language
    const invalidLang = {
      ...sampleManifest,
      metadata: { ...sampleManifest.metadata, language: "python" },
    };
    expect(() => validateBuildManifest(invalidLang)).toThrow(TypeError);

    // Invalid route entry
    const invalidRoute = {
      ...sampleManifest,
      routes: [{ method: "GET", pattern: "/test" }],
    };
    expect(() => validateBuildManifest(invalidRoute)).toThrow(TypeError);
  });
});

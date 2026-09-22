import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleDevCommand } from "../../packages/cli/src/index.js";

describe("Kyuu CLI 'kyuu dev' Unit & Error Handling Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `kyuu-dev-unit-test-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("handles missing project root by outputting code 3 and helpful message", async () => {
    let errOutput = "";
    const result = await handleDevCommand([], {
      cwd: tempDir,
      stderr: (msg) => {
        errOutput += msg;
      },
    });

    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("Kyuu project not found");
    expect(errOutput).toContain("Could not locate kyuu.config.ts");
  });
});

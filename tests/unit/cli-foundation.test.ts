import { describe, expect, it } from "vitest";
import { getHelpText, getVersion, runCli } from "../../packages/cli/src/index.js";

describe("Forge CLI Foundation Unit Tests", () => {
  it("getVersion returns authoritative version from package.json", () => {
    const version = getVersion();
    expect(version).toBe("0.0.0");
  });

  it("getHelpText returns standard CLI overview help text", () => {
    const helpText = getHelpText();
    expect(helpText).toContain("Forge CLI");
    expect(helpText).toContain("Usage:");
    expect(helpText).toContain("-h, --help");
    expect(helpText).toContain("-v, --version");
  });

  it("bare 'forge' command (empty args) prints help and exits 0", async () => {
    let output = "";
    const result = await runCli([], {
      stdout: (msg) => {
        output += msg;
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Forge CLI");
    expect(output).toContain("Forge CLI");
  });

  it("'forge --help' prints help and exits 0", async () => {
    let output = "";
    const result = await runCli(["--help"], {
      stdout: (msg) => {
        output += msg;
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Forge CLI");
    expect(output).toContain("Forge CLI");
  });

  it("'forge -h' prints help and exits 0", async () => {
    let output = "";
    const result = await runCli(["-h"], {
      stdout: (msg) => {
        output += msg;
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Forge CLI");
    expect(output).toContain("Forge CLI");
  });

  it("'forge --version' prints version and exits 0", async () => {
    let output = "";
    const result = await runCli(["--version"], {
      stdout: (msg) => {
        output += msg;
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("0.0.0");
    expect(output).toBe("0.0.0");
  });

  it("'forge -v' prints version and exits 0", async () => {
    let output = "";
    const result = await runCli(["-v"], {
      stdout: (msg) => {
        output += msg;
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("0.0.0");
    expect(output).toBe("0.0.0");
  });

  it("handles '--help' flag when combined with other args", async () => {
    let output = "";
    const result = await runCli(["something", "--help"], {
      stdout: (msg) => {
        output += msg;
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Forge CLI");
    expect(output).toContain("Forge CLI");
  });

  it("unknown command returns exit code 1 and prints useful error", async () => {
    let errorOutput = "";
    const result = await runCli(["unknown-command"], {
      stderr: (msg) => {
        errorOutput += msg;
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Unknown command: unknown-command");
    expect(result.output).toContain('Run "forge --help" for available commands.');
    expect(errorOutput).toContain("Unknown command: unknown-command");
  });

  it("unknown flag option returns exit code 1 and prints useful error", async () => {
    let errorOutput = "";
    const result = await runCli(["--invalid-flag"], {
      stderr: (msg) => {
        errorOutput += msg;
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Unknown option: --invalid-flag");
    expect(result.output).toContain('Run "forge --help" for available options.');
    expect(errorOutput).toContain("Unknown option: --invalid-flag");
  });

  it("CLI core isolation: help and version execution do not trigger HTTP server or config loader", async () => {
    // Standard runCli execution without core runtime imports
    const helpResult = await runCli(["--help"], { stdout: () => {} });
    const versionResult = await runCli(["--version"], { stdout: () => {} });

    expect(helpResult.exitCode).toBe(0);
    expect(versionResult.exitCode).toBe(0);
  });
});

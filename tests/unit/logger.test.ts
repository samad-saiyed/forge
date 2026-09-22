import { describe, expect, it, vi } from "vitest";
import {
  ConsoleTransport,
  createApp,
  createLogger,
  normalizeErrorMetadata,
  type LogRecord,
  type LogTransport,
} from "../../packages/core/src/index.js";

class MemoryTransport implements LogTransport {
  public records: LogRecord[] = [];

  log(record: LogRecord): void {
    this.records.push(record);
  }
}

describe("Action 74 — Logger Core Implementation", () => {
  it("dispatches log records to transport when logging is enabled", () => {
    const transport = new MemoryTransport();
    const logger = createLogger({ enabled: true, level: "debug" }, [transport]);

    logger.debug("Debug msg", { tag: "test" });
    logger.info("Info msg", { user: "samad" });
    logger.warn("Warn msg", { attempt: 3 });
    logger.error("Error msg", { status: 500 });

    expect(transport.records).toHaveLength(4);

    expect(transport.records[0]).toMatchObject({
      level: "debug",
      message: "Debug msg",
      metadata: { tag: "test" },
    });
    expect(transport.records[1]).toMatchObject({
      level: "info",
      message: "Info msg",
      metadata: { user: "samad" },
    });
    expect(transport.records[2]).toMatchObject({
      level: "warn",
      message: "Warn msg",
      metadata: { attempt: 3 },
    });
    expect(transport.records[3]).toMatchObject({
      level: "error",
      message: "Error msg",
      metadata: { status: 500 },
    });
  });

  it("filters logs based on severity level", () => {
    const transport = new MemoryTransport();
    const logger = createLogger({ enabled: true, level: "warn" }, [transport]);

    logger.debug("Debug should be skipped");
    logger.info("Info should be skipped");
    logger.warn("Warn should pass");
    logger.error("Error should pass");

    expect(transport.records).toHaveLength(2);
    expect(transport.records[0].level).toBe("warn");
    expect(transport.records[1].level).toBe("error");
  });

  it("fast-path returns early when logging is disabled", () => {
    const transport = new MemoryTransport();
    const logger = createLogger({ enabled: false, level: "debug" }, [transport]);

    logger.debug("No output");
    logger.info("No output");
    logger.warn("No output");
    logger.error("No output");

    expect(transport.records).toHaveLength(0);
    expect(logger.enabled).toBe(false);
  });

  it("normalizes Error objects in metadata and direct error calls", () => {
    const err = new Error("Database query failed");
    (err as unknown as Record<string, unknown>).code = "ERR_DB";

    const normalized = normalizeErrorMetadata(err);
    expect(normalized).toMatchObject({
      name: "Error",
      message: "Database query failed",
      code: "ERR_DB",
    });
    expect(typeof normalized.stack).toBe("string");

    const transport = new MemoryTransport();
    const logger = createLogger({ enabled: true, level: "info" }, [transport]);

    // Test metadata containing Error instance
    logger.info("Op failed", { err });
    expect(transport.records[0].metadata?.err).toMatchObject({
      name: "Error",
      message: "Database query failed",
      code: "ERR_DB",
    });

    // Test direct logger.error(err)
    logger.error(err, { extra: "context" });
    expect(transport.records[1]).toMatchObject({
      level: "error",
      message: "Database query failed",
      metadata: {
        name: "Error",
        message: "Database query failed",
        code: "ERR_DB",
        extra: "context",
      },
    });
  });

  it("ConsoleTransport writes to process.stdout and process.stderr", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const consoleTransport = new ConsoleTransport();
      consoleTransport.log({
        level: "info",
        message: "Server ready",
        metadata: { port: 3000 },
        timestamp: 1600000000000,
      });

      consoleTransport.log({
        level: "error",
        message: "Unhandled exception",
        metadata: { code: 500 },
        timestamp: 1600000000000,
      });

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] Server ready {"port":3000}\n'),
      );
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Unhandled exception {"code":500}\n'),
      );
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });

  it("Application integrates logger based on configuration", () => {
    const appDisabled = createApp({
      skipFsRouting: true,
      config: { logging: false },
    });
    expect(appDisabled.logger.enabled).toBe(false);

    const appEnabled = createApp({
      skipFsRouting: true,
      config: { logging: { enabled: true, level: "warn" } },
    });
    expect(appEnabled.logger.enabled).toBe(true);
    expect(appEnabled.logger.level).toBe("warn");
  });
});

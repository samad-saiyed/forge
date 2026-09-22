import type { ResolvedLoggingConfig } from "./config.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogMetadata = Record<string, unknown>;

export interface LogRecord {
  level: LogLevel;
  message: string;
  metadata?: LogMetadata;
  timestamp: number;
}

export interface LogTransport {
  log(record: LogRecord): void;
}

export interface Logger {
  readonly enabled: boolean;
  readonly level: LogLevel;
  debug(message: string, metadata?: LogMetadata): void;
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(messageOrError: string | Error, metadata?: LogMetadata): void;
}

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function normalizeErrorMetadata(err: Error): LogMetadata {
  const result: LogMetadata = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
  for (const key of Object.keys(err)) {
    if (key !== "name" && key !== "message" && key !== "stack") {
      result[key] = (err as unknown as Record<string, unknown>)[key];
    }
  }
  return result;
}

export function normalizeMetadata(metadata?: LogMetadata): LogMetadata | undefined {
  if (!metadata) return undefined;
  const result: LogMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value instanceof Error) {
      result[key] = normalizeErrorMetadata(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class ConsoleTransport implements LogTransport {
  log(record: LogRecord): void {
    const formattedMeta =
      record.metadata && Object.keys(record.metadata).length > 0
        ? ` ${JSON.stringify(record.metadata)}`
        : "";
    const line = `[${new Date(record.timestamp).toISOString()}] [${record.level.toUpperCase()}] ${record.message}${formattedMeta}`;
    if (record.level === "warn" || record.level === "error") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  }
}

export class KyuuLogger implements Logger {
  public readonly enabled: boolean;
  public readonly level: LogLevel;
  private readonly minSeverity: number;
  private readonly transports: LogTransport[];

  constructor(config?: ResolvedLoggingConfig, transports?: LogTransport[]) {
    this.enabled = config?.enabled ?? false;
    this.level = config?.level ?? "info";
    this.minSeverity = LOG_LEVEL_SEVERITY[this.level] ?? 1;
    this.transports = transports ?? [new ConsoleTransport()];
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false;
    const severity = LOG_LEVEL_SEVERITY[level];
    return severity >= this.minSeverity;
  }

  private dispatch(level: LogLevel, message: string, metadata?: LogMetadata): void {
    if (!this.shouldLog(level)) return;

    const normalizedMeta = normalizeMetadata(metadata);
    const record: LogRecord = {
      level,
      message,
      metadata: normalizedMeta,
      timestamp: Date.now(),
    };

    for (const transport of this.transports) {
      transport.log(record);
    }
  }

  debug(message: string, metadata?: LogMetadata): void {
    this.dispatch("debug", message, metadata);
  }

  info(message: string, metadata?: LogMetadata): void {
    this.dispatch("info", message, metadata);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.dispatch("warn", message, metadata);
  }

  error(messageOrError: string | Error, metadata?: LogMetadata): void {
    if (!this.shouldLog("error")) return;

    let message: string;
    let combinedMetadata: LogMetadata | undefined = metadata;

    if (messageOrError instanceof Error) {
      message = messageOrError.message;
      const normalizedErr = normalizeErrorMetadata(messageOrError);
      combinedMetadata = metadata ? { ...normalizedErr, ...metadata } : normalizedErr;
    } else {
      message = messageOrError;
    }

    this.dispatch("error", message, combinedMetadata);
  }
}

export function createLogger(config?: ResolvedLoggingConfig, transports?: LogTransport[]): Logger {
  return new KyuuLogger(config, transports);
}

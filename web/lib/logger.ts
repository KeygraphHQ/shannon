/**
 * Logger - Comprehensive logging service for debugging
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *
 *   logger.info('User logged in', { userId: '123' });
 *   logger.error('Failed to process', { error: err });
 *   logger.debug('Variable state', { data });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  stack?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Get minimum log level from environment (default to 'info' in production, 'debug' in development)
function getMinLogLevel(): LogLevel {
  const env = process.env.NODE_ENV;
  const configuredLevel = process.env.LOG_LEVEL as LogLevel | undefined;

  if (configuredLevel && LOG_LEVELS[configuredLevel] !== undefined) {
    return configuredLevel;
  }

  return env === "production" ? "info" : "debug";
}

function shouldLog(level: LogLevel): boolean {
  const minLevel = getMinLogLevel();
  return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
}

function formatLogEntry(entry: LogEntry): string {
  const { level, message, timestamp, context, stack } = entry;
  const contextStr = context ? ` ${JSON.stringify(context)}` : "";
  const stackStr = stack ? `\n${stack}` : "";

  // In production, output JSON for log aggregation services
  if (process.env.NODE_ENV === "production") {
    return JSON.stringify({
      level,
      message,
      timestamp,
      ...context,
      stack,
    });
  }

  // In development, output human-readable format
  const levelColors: Record<LogLevel, string> = {
    debug: "\x1b[36m", // cyan
    info: "\x1b[32m", // green
    warn: "\x1b[33m", // yellow
    error: "\x1b[31m", // red
  };

  const reset = "\x1b[0m";
  const color = levelColors[level];
  const levelStr = level.toUpperCase().padEnd(5);

  return `${color}[${levelStr}]${reset} ${timestamp} - ${message}${contextStr}${stackStr}`;
}

function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext
): LogEntry {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };

  if (context) {
    // Extract error stack if present
    if (context.error instanceof Error) {
      entry.stack = context.error.stack;
      entry.context = {
        ...context,
        error: {
          name: context.error.name,
          message: context.error.message,
        },
      };
    } else {
      entry.context = context;
    }
  }

  return entry;
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const entry = createLogEntry(level, message, context);
  const formattedMessage = formatLogEntry(entry);

  switch (level) {
    case "debug":
    case "info":
      console.log(formattedMessage);
      break;
    case "warn":
      console.warn(formattedMessage);
      break;
    case "error":
      console.error(formattedMessage);
      break;
  }
}

export const logger = {
  /**
   * Debug level - detailed information for debugging
   * Not shown in production by default
   */
  debug: (message: string, context?: LogContext) =>
    log("debug", message, context),

  /**
   * Info level - general information about app operation
   */
  info: (message: string, context?: LogContext) => log("info", message, context),

  /**
   * Warn level - potentially problematic situations
   */
  warn: (message: string, context?: LogContext) => log("warn", message, context),

  /**
   * Error level - error events that need attention
   */
  error: (message: string, context?: LogContext) =>
    log("error", message, context),

  /**
   * Create a child logger with preset context
   */
  child: (baseContext: LogContext) => ({
    debug: (message: string, context?: LogContext) =>
      log("debug", message, { ...baseContext, ...context }),
    info: (message: string, context?: LogContext) =>
      log("info", message, { ...baseContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      log("warn", message, { ...baseContext, ...context }),
    error: (message: string, context?: LogContext) =>
      log("error", message, { ...baseContext, ...context }),
  }),

  /**
   * Time a function execution
   */
  time: async <T>(
    label: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> => {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      log("debug", `${label} completed`, { ...context, durationMs: duration });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      log("error", `${label} failed`, {
        ...context,
        durationMs: duration,
        error: error as Error,
      });
      throw error;
    }
  },
};

export type { LogLevel, LogContext, LogEntry };

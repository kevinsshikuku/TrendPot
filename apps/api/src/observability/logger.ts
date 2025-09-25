import pino from "pino";

/**
 * Creates the base pino logger configuration shared by the API.
 * The logger is JSON-structured to satisfy the "structured logging"
 * requirement in the Foundation Hardening milestone and includes
 * consistent service metadata so downstream systems can parse it.
 */
export const apiLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "trendpot-api" },
  formatters: {
    level: (label) => ({ level: label })
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

/**
 * Helper to spawn request-scoped child loggers with a correlation ID.
 */
export const createRequestLogger = (requestId: string) =>
  apiLogger.child({ requestId });

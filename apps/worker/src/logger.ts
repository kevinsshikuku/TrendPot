import pino from "pino";

/**
 * Shared worker logger mirroring the API's structured logging format.
 */
export const workerLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "trendpot-worker" },
  formatters: {
    level: (label) => ({ level: label })
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

import type { LoggerService } from "@nestjs/common";
import type { Logger } from "pino";

/**
 * Bridges Nest's LoggerService contract with our pino instance so
 * framework logs flow through the same structured sink.
 */
export class PinoLoggerService implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: string) {
    this.logger.info({ context }, message);
  }

  error(message: unknown, trace?: string, context?: string) {
    this.logger.error({ context, trace }, message);
  }

  warn(message: unknown, context?: string) {
    this.logger.warn({ context }, message);
  }

  debug?(message: unknown, context?: string) {
    this.logger.debug({ context }, message);
  }

  verbose?(message: unknown, context?: string) {
    this.logger.trace({ context }, message);
  }
}

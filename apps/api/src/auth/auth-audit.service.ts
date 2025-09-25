import { Injectable } from "@nestjs/common";
import type { Logger } from "pino";
import type { UserRole } from "@trendpot/types";

interface AuditFailurePayload {
  requestId: string;
  operation: string;
  reason: string;
  logger: Logger;
  userId?: string;
  roles?: UserRole[];
  ipAddress?: string;
}

@Injectable()
export class AuthAuditService {
  recordAuthorizationFailure(payload: AuditFailurePayload) {
    const { logger, ...details } = payload;
    logger.warn({ event: "auth.authorization_failure", ...details }, "Authorization failure detected");
  }

  recordRateLimitViolation(payload: AuditFailurePayload & { retryAt: number }) {
    const { logger, retryAt, ...details } = payload;
    logger.warn(
      {
        event: "auth.rate_limit_violation",
        retryAt,
        ...details
      },
      "Rate limit triggered"
    );
  }
}

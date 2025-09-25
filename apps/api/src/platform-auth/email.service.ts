import { Injectable } from "@nestjs/common";
import type { Logger } from "pino";

interface SendOtpEmailParams {
  email: string;
  otpCode: string;
  token: string;
  expiresAt: Date;
  requestId?: string;
  logger: Logger;
}

/**
 * Provides a thin abstraction over our transactional email provider.
 * For Phase 1 we stub the integration by logging the payload so the
 * Platform team can verify issuance without external dependencies.
 */
@Injectable()
export class AuthEmailService {
  async sendOtpEmail(params: SendOtpEmailParams) {
    const { email, otpCode, token, expiresAt, logger, requestId } = params;

    logger.info(
      {
        event: "auth.email_otp.dispatched",
        email,
        otpCode,
        token,
        expiresAt: expiresAt.toISOString(),
        requestId
      },
      "Stubbed OTP email dispatched"
    );
  }
}

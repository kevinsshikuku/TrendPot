import { createVerify } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { apiLogger } from "../observability/logger";

export interface SignatureVerificationResult {
  valid: boolean;
  failureReason?: string;
  receivedTimestamp?: string;
  timestampSkewSeconds?: number;
}

interface VerificationOptions {
  payload: string;
  signature?: string;
  timestampHeader?: string;
  now?: Date;
}

const DEFAULT_TOLERANCE_SECONDS = 300;

@Injectable()
export class MpesaSignatureService {
  private readonly logger = apiLogger.child({ module: "MpesaSignatureService" });
  private readonly toleranceSeconds = Number(
    process.env.MPESA_WEBHOOK_TOLERANCE_SECONDS ?? DEFAULT_TOLERANCE_SECONDS
  );
  private readonly publicKey = this.resolvePublicKey();

  verify(options: VerificationOptions): SignatureVerificationResult {
    const { payload, signature, timestampHeader } = options;
    const now = options.now ?? new Date();

    if (!signature) {
      this.logger.warn({ event: "mpesa.signature.missing" }, "Missing Safaricom signature header");
      return { valid: false, failureReason: "missing_signature" };
    }

    if (!timestampHeader) {
      this.logger.warn({ event: "mpesa.timestamp.missing" }, "Missing Safaricom timestamp header");
      return { valid: false, failureReason: "missing_timestamp" };
    }

    const timestamp = this.parseTimestamp(timestampHeader);

    if (!timestamp) {
      return {
        valid: false,
        failureReason: "invalid_timestamp",
        receivedTimestamp: timestampHeader
      };
    }

    const skewSeconds = Math.round((now.getTime() - timestamp.getTime()) / 1000);

    if (Math.abs(skewSeconds) > this.toleranceSeconds) {
      return {
        valid: false,
        failureReason: "timestamp_out_of_bounds",
        receivedTimestamp: timestampHeader,
        timestampSkewSeconds: skewSeconds
      };
    }

    if (!this.publicKey) {
      this.logger.error(
        { event: "mpesa.signature.public_key_missing" },
        "MPESA_WEBHOOK_PUBLIC_CERT is not configured"
      );
      return {
        valid: false,
        failureReason: "missing_public_key",
        receivedTimestamp: timestampHeader,
        timestampSkewSeconds: skewSeconds
      };
    }

    try {
      const verifier = createVerify("RSA-SHA256");
      verifier.update(payload);
      verifier.end();
      const signatureBuffer = Buffer.from(signature, "base64");
      const valid = verifier.verify(this.publicKey, signatureBuffer);

      return {
        valid,
        failureReason: valid ? undefined : "signature_mismatch",
        receivedTimestamp: timestampHeader,
        timestampSkewSeconds: skewSeconds
      };
    } catch (error) {
      this.logger.error(
        { event: "mpesa.signature.verification_error", error: (error as Error).message },
        "Failed to verify Safaricom signature"
      );
      return {
        valid: false,
        failureReason: "verification_error",
        receivedTimestamp: timestampHeader,
        timestampSkewSeconds: skewSeconds
      };
    }
  }

  private parseTimestamp(raw: string): Date | undefined {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private resolvePublicKey(): string | undefined {
    const raw = process.env.MPESA_WEBHOOK_PUBLIC_CERT;

    if (!raw) {
      return undefined;
    }

    const normalized = raw.includes("-----BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8");

    return normalized;
  }
}

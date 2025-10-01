import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import type { Connection, Model } from "mongoose";
import { apiLogger } from "../observability/logger";
import { AuditLogService } from "../audit/audit-log.service";
import { DonationEntity, DonationDocument } from "./donation.schema";
import { DonationStatus } from "./donation-status.enum";
import type { SignatureVerificationResult } from "../webhooks/mpesa-signature.service";

export interface MpesaCallbackMetadata {
  rawEventId: string;
  requestId?: string;
  sourceIp?: string;
}

export interface MpesaStkPushCallbackPayload {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item?: Array<{ Name: string; Value?: string | number | null }>;
      };
    };
  };
  [key: string]: unknown;
}

export interface DonationProcessingResult {
  donation: DonationDocument | null;
  idempotentReplay: boolean;
}

interface ParsedMetadataItem {
  amountCents?: number;
  receipt?: string;
  phoneNumber?: string;
  transactionDate?: Date;
  accountReference?: string;
}

interface ParsedCallback {
  checkoutRequestId: string;
  merchantRequestId?: string;
  resultCode: number;
  resultDescription: string;
  metadata: ParsedMetadataItem;
}

const SENSITIVE_FIELDS = ["payerPhone"];

@Injectable()
export class DonationService {
  private readonly logger = apiLogger.child({ module: "DonationService" });

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(DonationEntity.name)
    private readonly donationModel: Model<DonationDocument>,
    private readonly auditLogService: AuditLogService
  ) {}

  async processStkPushCallback(
    payload: MpesaStkPushCallbackPayload,
    verification: SignatureVerificationResult,
    metadata: MpesaCallbackMetadata
  ): Promise<DonationProcessingResult> {
    const parsed = this.parseCallback(payload);

    if (!parsed) {
      this.logger.warn(
        {
          event: "donation.callback.unrecognized",
          rawEventId: metadata.rawEventId,
          verification
        },
        "Received STK Push callback without CheckoutRequestID; ignoring"
      );

      await this.auditLogService.record({
        eventType: "webhook.mpesa.stkpush",
        actorType: "webhook",
        actorId: "mpesa",
        outcome: "ignored",
        resourceType: "donation",
        metadata: {
          reason: "missing_checkout_request_id",
          rawEventId: metadata.rawEventId,
          verification
        }
      });

      return { donation: null, idempotentReplay: false };
    }

    const session = await this.connection.startSession();
    let result: DonationProcessingResult = { donation: null, idempotentReplay: false };

    try {
      await session.withTransaction(async () => {
        const existing = await this.donationModel
          .findOne({ mpesaCheckoutRequestId: parsed.checkoutRequestId })
          .session(session)
          .exec();

        const targetStatus = parsed.resultCode === 0 ? DonationStatus.Paid : DonationStatus.Failed;
        const now = new Date();

        if (!existing) {
          const [created] = await this.donationModel.create(
            [
              {
                mpesaCheckoutRequestId: parsed.checkoutRequestId,
                merchantRequestId: parsed.merchantRequestId,
                accountReference: parsed.metadata.accountReference,
                amountCents: parsed.metadata.amountCents ?? 0,
                mpesaReceipt: parsed.metadata.receipt,
                payerPhone: parsed.metadata.phoneNumber,
                transactionCompletedAt: parsed.metadata.transactionDate,
                status: targetStatus,
                resultCode: parsed.resultCode,
                resultDescription: parsed.resultDescription,
                rawCallback: payload as Record<string, unknown>,
                lastCallbackAt: now
              } as Partial<DonationEntity>
            ],
            { session }
          );

          result = { donation: created, idempotentReplay: false };
        } else {
          const duplicate = this.isDuplicate(existing, parsed);

          if (duplicate) {
            result = { donation: existing, idempotentReplay: true };
          } else {
            const updated = await this.donationModel
              .findOneAndUpdate(
                { _id: existing._id },
                {
                  $set: {
                    amountCents: parsed.metadata.amountCents ?? existing.amountCents,
                    mpesaReceipt: parsed.metadata.receipt ?? existing.mpesaReceipt,
                    payerPhone: parsed.metadata.phoneNumber ?? existing.payerPhone,
                    transactionCompletedAt:
                      parsed.metadata.transactionDate ?? existing.transactionCompletedAt,
                    merchantRequestId: parsed.merchantRequestId ?? existing.merchantRequestId,
                    accountReference:
                      parsed.metadata.accountReference ?? existing.accountReference,
                    status: targetStatus,
                    resultCode: parsed.resultCode,
                    resultDescription: parsed.resultDescription,
                    rawCallback: payload as Record<string, unknown>,
                    lastCallbackAt: now
                  }
                },
                { new: true, session }
              )
              .exec();

            result = { donation: updated ?? existing, idempotentReplay: false };
          }
        }

        const donationId = result.donation?._id?.toString();

        await this.auditLogService.record(
          {
            eventType: "webhook.mpesa.stkpush",
            actorType: "webhook",
            actorId: "mpesa",
            outcome: result.idempotentReplay ? "duplicate" : "processed",
            resourceType: "donation",
            resourceId: donationId,
            metadata: {
              checkoutRequestId: parsed.checkoutRequestId,
              merchantRequestId: parsed.merchantRequestId,
              accountReference: parsed.metadata.accountReference,
              resultCode: parsed.resultCode,
              idempotentReplay: result.idempotentReplay,
              verification,
              rawEventId: metadata.rawEventId,
              requestId: metadata.requestId,
              sourceIp: metadata.sourceIp
            }
          },
          session
        );
      });
    } finally {
      await session.endSession();
    }

    const logPayload = {
      event: "donation.callback.processed",
      checkoutRequestId: this.maskValue(parsed?.checkoutRequestId ?? ""),
      idempotentReplay: result.idempotentReplay,
      verification: {
        valid: verification.valid,
        reason: verification.failureReason,
        skewSeconds: verification.timestampSkewSeconds
      },
      donationId: result.donation?._id?.toString(),
      status: result.donation?.status,
      metric: "mpesa_callback_processed"
    };

    this.logger.info(logPayload, "Processed STK Push callback");

    return result;
  }

  private parseCallback(payload: MpesaStkPushCallbackPayload): ParsedCallback | null {
    const body = payload?.Body;
    const callback = body?.stkCallback;

    if (!callback?.CheckoutRequestID) {
      return null;
    }

    const metadata = this.parseMetadata(callback.CallbackMetadata?.Item ?? []);

    return {
      checkoutRequestId: callback.CheckoutRequestID,
      merchantRequestId: callback.MerchantRequestID,
      resultCode: callback.ResultCode,
      resultDescription: callback.ResultDesc,
      metadata
    };
  }

  private parseMetadata(items: Array<{ Name: string; Value?: string | number | null }>): ParsedMetadataItem {
    const metadata: ParsedMetadataItem = {};

    for (const item of items ?? []) {
      switch (item.Name) {
        case "Amount": {
          const amount = typeof item.Value === "number" ? item.Value : Number(item.Value);
          if (!Number.isNaN(amount)) {
            metadata.amountCents = Math.round(amount * 100);
          }
          break;
        }
        case "MpesaReceiptNumber":
          if (typeof item.Value === "string") {
            metadata.receipt = item.Value;
          }
          break;
        case "PhoneNumber":
          if (typeof item.Value === "string") {
            metadata.phoneNumber = item.Value;
          }
          break;
        case "TransactionDate":
          if (typeof item.Value === "number" || typeof item.Value === "string") {
            const asString = String(item.Value);
            const parsed = this.parseMpesaTimestamp(asString);
            if (parsed) {
              metadata.transactionDate = parsed;
            }
          }
          break;
        case "AccountReference":
          if (typeof item.Value === "string") {
            metadata.accountReference = item.Value;
          }
          break;
        default:
          break;
      }
    }

    return metadata;
  }

  private parseMpesaTimestamp(raw: string): Date | undefined {
    if (!raw || raw.length !== 14) {
      return undefined;
    }

    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6));
    const day = Number(raw.slice(6, 8));
    const hour = Number(raw.slice(8, 10));
    const minute = Number(raw.slice(10, 12));
    const second = Number(raw.slice(12, 14));

    if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
      return undefined;
    }

    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private isDuplicate(existing: DonationDocument, parsed: ParsedCallback): boolean {
    const amountMatches =
      typeof parsed.metadata.amountCents === "number"
        ? existing.amountCents === parsed.metadata.amountCents
        : true;

    const receiptMatches = parsed.metadata.receipt
      ? existing.mpesaReceipt === parsed.metadata.receipt
      : true;

    const statusMatches =
      existing.status === (parsed.resultCode === 0 ? DonationStatus.Paid : DonationStatus.Failed);

    const resultCodeMatches = existing.resultCode === parsed.resultCode;

    return amountMatches && receiptMatches && statusMatches && resultCodeMatches;
  }

  private maskValue(value: string): string {
    if (!value) {
      return value;
    }

    if (value.length <= 4) {
      return "*".repeat(value.length);
    }

    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
}

export const redactSensitiveDonationFields = (payload: Record<string, unknown>) => {
  const clone = { ...payload };

  for (const field of SENSITIVE_FIELDS) {
    if (typeof clone[field] === "string") {
      clone[field] = "***redacted***";
    }
  }

  return clone;
};

import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { SpanStatusCode } from "@opentelemetry/api";
import type { Connection, Model, Types } from "mongoose";
import { AuditLogService } from "../../audit/audit-log.service";
import { apiLogger } from "../../observability/logger";
import { apiTracer, donationSplitHistogram } from "../../observability/telemetry";
import { DonationEntity, type DonationDocument } from "../donation.schema";
import { DonationStatus } from "../donation-status.enum";
import type { SignatureVerificationResult } from "../../webhooks/mpesa-signature.service";
import { LedgerService } from "../../ledger/ledger.service";
import { LedgerConfigService } from "../../ledger/ledger.config";

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

interface DonationDistribution {
  creatorShareCents: number;
  platformShareCents: number;
  platformVatCents: number;
  commissionGrossCents: number;
}

const SENSITIVE_FIELDS = ["payerPhone"];

@Injectable()
export class DonationCallbackService {
  private readonly logger = apiLogger.child({ module: "DonationCallbackService" });

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(DonationEntity.name)
    private readonly donationModel: Model<DonationDocument>,
    private readonly auditLogService: AuditLogService,
    private readonly ledgerService: LedgerService,
    private readonly ledgerConfig: LedgerConfigService
  ) {}

  async processStkPushCallback(
    payload: MpesaStkPushCallbackPayload,
    verification: SignatureVerificationResult,
    metadata: MpesaCallbackMetadata
  ): Promise<DonationProcessingResult> {
    const span = apiTracer.startSpan("donation.process_stk_callback", {
      attributes: {
        "mpesa.raw_event_id": metadata.rawEventId,
        "mpesa.verification.valid": verification.valid,
        "mpesa.verification.reason": verification.failureReason ?? "",
        "mpesa.source_ip": metadata.sourceIp ?? ""
      }
    });

    try {
      const parsed = this.parseCallback(payload);

      if (!parsed) {
        span.addEvent("callback.unrecognized", {
          reason: "missing_checkout_request_id"
        });
        span.setStatus({ code: SpanStatusCode.ERROR, message: "missing_checkout_request_id" });
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

      span.setAttribute("mpesa.checkout_request_id", parsed.checkoutRequestId);
      span.setAttribute("mpesa.result_code", parsed.resultCode);
      span.setAttribute("mpesa.result_description", parsed.resultDescription);

      const session = await this.connection.startSession();
      let result: DonationProcessingResult = { donation: null, idempotentReplay: false };

      try {
        await session.withTransaction(async () => {
          const existing = await this.donationModel
            .findOne({ mpesaCheckoutRequestId: parsed.checkoutRequestId })
            .session(session)
            .exec();

        if (!existing) {
          this.logger.error(
            {
              event: "donation.callback.orphan",
              checkoutRequestId: parsed.checkoutRequestId,
              rawEventId: metadata.rawEventId,
              verification
            },
            "Callback received for unknown CheckoutRequestID"
          );

          await this.auditLogService.record(
            {
              eventType: "webhook.mpesa.stkpush",
              actorType: "webhook",
              actorId: "mpesa",
              outcome: "missing",
              resourceType: "donation",
              metadata: {
                checkoutRequestId: parsed.checkoutRequestId,
                merchantRequestId: parsed.merchantRequestId,
                rawEventId: metadata.rawEventId,
                verification
              }
            },
            session
          );

          result = { donation: null, idempotentReplay: false };
          return;
        }

          const targetStatus = parsed.resultCode === 0 ? DonationStatus.Succeeded : DonationStatus.Failed;
          const now = new Date();

          const duplicate = this.isDuplicate(existing, parsed, targetStatus);

          if (duplicate) {
            result = { donation: existing, idempotentReplay: true };
            span.addEvent("donation.duplicate", {
              donationId: existing._id.toString(),
              status: existing.status
            });
          } else {
            let distribution: DonationDistribution | null = null;
            let ledgerJournalEntryId = existing.ledgerJournalEntryId;

            const amountCents = parsed.metadata.amountCents ?? existing.amountCents;

            if (targetStatus === DonationStatus.Succeeded && !ledgerJournalEntryId) {
              if (
                typeof amountCents !== "number" ||
                !Number.isInteger(amountCents) ||
                amountCents <= 0
              ) {
                throw new Error("A positive integer amount is required to post donation financials.");
              }

              distribution = this.computeDistribution(amountCents);
              span.addEvent("donation.distribution", {
                donationId: existing._id.toString(),
                amountCents,
                creatorShareCents: distribution.creatorShareCents,
                platformShareCents: distribution.platformShareCents,
                platformVatCents: distribution.platformVatCents
              });

              const ledgerSpan = apiTracer.startSpan("ledger.record_donation_success", {
                attributes: {
                  donationId: existing._id.toString(),
                  amountCents
                }
              });

              try {
                const ledgerResult = await this.ledgerService.recordDonationSuccess({
                  session,
                  donationId: existing._id.toString(),
                  amountCents,
                  creatorShareCents: distribution.creatorShareCents,
                  commissionNetCents: distribution.platformShareCents,
                  vatCents: distribution.platformVatCents,
                  creatorUserId: existing.creatorUserId as Types.ObjectId,
                  currency: existing.currency,
                  donatedAt: existing.donatedAt ?? now
                });

                ledgerSpan.setStatus({ code: SpanStatusCode.OK });

                this.logger.info(
                  {
                    event: "donation.ledger.recorded",
                    donationId: existing._id.toString(),
                    journalEntryId: ledgerResult.journalEntryId.toString(),
                    created: ledgerResult.created
                  },
                  "Donation ledger posting completed"
                );

                ledgerJournalEntryId = ledgerResult.journalEntryId;
              } catch (error) {
                ledgerSpan.recordException(error as Error);
                ledgerSpan.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
                throw error;
              } finally {
                ledgerSpan.end();
              }

              donationSplitHistogram.record(amountCents, {
                status: targetStatus,
                duplicate: 0
              });
            }

            const statusHistoryEntry = {
              status: targetStatus,
              occurredAt: now,
            description: parsed.resultDescription
          };

          const updateSet: Record<string, unknown> = {
            amountCents: parsed.metadata.amountCents ?? existing.amountCents,
            mpesaReceipt: parsed.metadata.receipt ?? existing.mpesaReceipt,
            payerPhone: parsed.metadata.phoneNumber ?? existing.payerPhone,
            transactionCompletedAt: parsed.metadata.transactionDate ?? existing.transactionCompletedAt,
            mpesaMerchantRequestId: parsed.merchantRequestId ?? existing.mpesaMerchantRequestId,
            accountReference: parsed.metadata.accountReference ?? existing.accountReference,
            status: targetStatus,
            resultCode: parsed.resultCode,
            resultDescription: parsed.resultDescription,
            rawCallback: payload as Record<string, unknown>,
            lastCallbackAt: now
          };

          if (distribution) {
            updateSet.creatorShareCents = distribution.creatorShareCents;
            updateSet.platformShareCents = distribution.platformShareCents;
            updateSet.platformVatCents = distribution.platformVatCents;
            updateSet.platformFeeCents = existing.platformFeeCents ?? 0;
            updateSet.availableAt = existing.availableAt ?? now;
          }

          if (ledgerJournalEntryId) {
            updateSet.ledgerJournalEntryId = ledgerJournalEntryId;
          }

            const updated = await this.donationModel
              .findOneAndUpdate(
                { _id: existing._id },
                {
                  $set: updateSet,
                $push: { statusHistory: statusHistoryEntry }
              },
              { new: true, session }
            )
            .exec();

          result = { donation: updated ?? existing, idempotentReplay: false };
        }

        const donationId = result.donation?._id?.toString();

        if (result.idempotentReplay) {
          donationSplitHistogram.record(existing.amountCents ?? 0, {
            status: existing.status,
            duplicate: 1
          });
        }

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
            distribution: result.donation
              ? {
                  creatorShareCents: result.donation.creatorShareCents,
                  platformShareCents: result.donation.platformShareCents,
                  platformVatCents: result.donation.platformVatCents,
                  ledgerJournalEntryId: result.donation.ledgerJournalEntryId?.toString?.()
                }
              : undefined,
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
        checkoutRequestId: this.maskValue(parsed.checkoutRequestId ?? ""),
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

      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttribute("donation.id", result.donation?._id?.toString() ?? "");
      span.setAttribute("donation.status", result.donation?.status ?? "");
      span.setAttribute("donation.idempotent", result.idempotentReplay);

      this.logger.info(logPayload, "Processed STK Push callback");

      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
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

  private isDuplicate(existing: DonationDocument, parsed: ParsedCallback, targetStatus: DonationStatus): boolean {
    const amountMatches =
      typeof parsed.metadata.amountCents === "number"
        ? existing.amountCents === parsed.metadata.amountCents
        : true;

    const receiptMatches = parsed.metadata.receipt ? existing.mpesaReceipt === parsed.metadata.receipt : true;

    const statusMatches = existing.status === targetStatus;
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

  private computeDistribution(amountCents: number): DonationDistribution {
    const commissionRate = this.ledgerConfig.getPlatformCommissionRate();
    const vatRate = this.ledgerConfig.getVatRate();

    const commissionGross = Math.floor(amountCents * commissionRate);
    const vat = Math.round((commissionGross * vatRate) / (1 + vatRate));
    const commissionNet = commissionGross - vat;
    const creatorShare = amountCents - commissionGross;

    if (creatorShare + commissionNet + vat !== amountCents) {
      throw new Error("Distribution components do not balance to the gross amount.");
    }

    return {
      creatorShareCents: creatorShare,
      platformShareCents: commissionNet,
      platformVatCents: vat,
      commissionGrossCents: commissionGross
    };
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

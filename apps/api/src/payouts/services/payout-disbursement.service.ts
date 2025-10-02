import { Injectable, Logger } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import type { ClientSession, Connection, Model, Types } from "mongoose";
import { AuditLogService } from "../../audit/audit-log.service";
import { DonationEntity, type DonationDocument } from "../../donations/donation.schema";
import { DonationPayoutState } from "../../donations/donation-payout-state.enum";
import { LedgerService } from "../../ledger/ledger.service";
import { WalletEntity, type WalletDocument } from "../../ledger/schemas/wallet.schema";
import { apiLogger } from "../../observability/logger";
import {
  PayoutBatchEntity,
  type PayoutBatchDocument
} from "../schemas/payout-batch.schema";
import { PayoutItemEntity, type PayoutItemDocument } from "../schemas/payout-item.schema";
import { PayoutItemStatus } from "../models/payout-item-status.enum";
import { PayoutBatchStatus } from "../models/payout-batch-status.enum";

interface MpesaResultParameter {
  Key: string;
  Value: string | number | null;
}

export interface MpesaB2CResultPayload {
  Result?: {
    ResultType?: number;
    ResultCode?: number | string;
    ResultDesc?: string;
    ConversationID?: string;
    OriginatorConversationID?: string;
    TransactionID?: string;
    ResultParameters?: {
      ResultParameter?: MpesaResultParameter[];
    };
  };
  [key: string]: unknown;
}

export interface PayoutResultMetadata {
  rawEventId: string;
  requestId?: string;
  sourceIp?: string;
}

const parseResultParameters = (
  params: MpesaResultParameter[] | undefined
): Record<string, string | number | null> => {
  const result: Record<string, string | number | null> = {};
  for (const entry of params ?? []) {
    if (entry?.Key) {
      result[entry.Key] = entry.Value ?? null;
    }
  }
  return result;
};

const parseAmountCents = (value: string | number | null | undefined): number | null => {
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return Math.round(value * 100);
    }
    return null;
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return Math.round(numeric * 100);
    }
  }

  return null;
};

const parseDate = (raw: unknown): Date | null => {
  if (raw instanceof Date) {
    return raw;
  }

  if (typeof raw === "string") {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
};

const toObjectIdString = (value: unknown): string => {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof (value as { toHexString?: () => string }).toHexString === "function") {
    return (value as { toHexString: () => string }).toHexString();
  }

  return String(value);
};

@Injectable()
export class PayoutDisbursementService {
  private readonly logger: Logger;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(PayoutItemEntity.name) private readonly payoutItemModel: Model<PayoutItemDocument>,
    @InjectModel(PayoutBatchEntity.name) private readonly payoutBatchModel: Model<PayoutBatchDocument>,
    @InjectModel(DonationEntity.name) private readonly donationModel: Model<DonationDocument>,
    @InjectModel(WalletEntity.name) private readonly walletModel: Model<WalletDocument>,
    private readonly ledgerService: LedgerService,
    private readonly auditLogService: AuditLogService
  ) {
    this.logger = apiLogger.child({ module: "PayoutDisbursementService" });
  }

  async handleResultCallback(payload: MpesaB2CResultPayload, metadata: PayoutResultMetadata) {
    const result = payload?.Result;
    const conversationId = result?.ConversationID ?? result?.OriginatorConversationID;

    if (!conversationId) {
      this.logger.warn(
        { event: "payout.b2c.ignored", rawEventId: metadata.rawEventId },
        "Received B2C callback without conversation id"
      );
      return;
    }

    const session = await this.connection.startSession();

    try {
      await session.withTransaction(async () => {
        const payoutItem = await this.payoutItemModel
          .findOne({
            $or: [
              { mpesaConversationId: result?.ConversationID },
              { mpesaOriginatorConversationId: result?.OriginatorConversationID }
            ]
          })
          .session(session)
          .exec();

        if (!payoutItem) {
          this.logger.error(
            {
              event: "payout.b2c.orphan",
              rawEventId: metadata.rawEventId,
              conversationId,
              resultCode: result?.ResultCode
            },
            "B2C callback did not match a payout item"
          );
          return;
        }

        const resultParameters = parseResultParameters(result?.ResultParameters?.ResultParameter);
        const amountCents = parseAmountCents(resultParameters.TransactionAmount);
        const transactionTime = parseDate(resultParameters.TransactionCompletedDateTime) ?? new Date();
        const transactionReceipt =
          typeof result?.TransactionID === "string" && result?.TransactionID.trim()
            ? result.TransactionID.trim()
            : typeof resultParameters.TransactionReceipt === "string"
              ? resultParameters.TransactionReceipt
              : undefined;

        const resultCode = String(result?.ResultCode ?? "");
        const resultDescription = result?.ResultDesc ?? null;

        if (resultCode === "0" || resultCode === "00000000") {
          await this.onPayoutSucceeded({
            payoutItem,
            metadata,
            amountCents: amountCents ?? payoutItem.amountCents,
            transactionTime,
            transactionReceipt,
            resultCode,
            resultDescription,
            session
          });
        } else {
          await this.onPayoutFailed({
            payoutItem,
            metadata,
            resultCode,
            resultDescription,
            session
          });
        }
      });
    } finally {
      await session.endSession();
    }
  }

  private async onPayoutSucceeded(params: {
    payoutItem: PayoutItemDocument;
    metadata: PayoutResultMetadata;
    amountCents: number;
    transactionTime: Date;
    transactionReceipt?: string;
    resultCode: string;
    resultDescription: string | null;
    session: ClientSession;
  }) {
    const { payoutItem, amountCents, transactionReceipt, transactionTime, resultCode, resultDescription, session } = params;

    if (payoutItem.status === PayoutItemStatus.Succeeded) {
      this.logger.info(
        { event: "payout.b2c.duplicate", payoutItemId: toObjectIdString(payoutItem._id) },
        "Skipping already-succeeded payout item"
      );
      return;
    }

    const ledgerResult = await this.ledgerService.recordPayoutDisbursement({
      session,
      payoutItemId: toObjectIdString(payoutItem._id),
      amountCents: amountCents,
      feeCents: payoutItem.feeCents ?? 0,
      creatorUserId: payoutItem.creatorUserId as Types.ObjectId,
      walletId: payoutItem.walletId as Types.ObjectId,
      currency: payoutItem.currency,
      disbursedAt: transactionTime,
      receipt: transactionReceipt
    });

    await this.payoutItemModel
      .updateOne(
        { _id: payoutItem._id },
        {
          $set: {
            status: PayoutItemStatus.Succeeded,
            mpesaResultCode: resultCode,
            mpesaResultDescription: resultDescription,
            mpesaReceipt: transactionReceipt,
            ledgerJournalEntryId: ledgerResult.journalEntryId,
            lastAttemptAt: transactionTime,
            updatedAt: new Date()
          }
        }
      )
      .session(session)
      .exec();

    await this.donationModel
      .updateMany(
        { _id: { $in: payoutItem.donationIds } },
        {
          $set: {
            payoutState: DonationPayoutState.Paid,
            paidAt: transactionTime,
            payoutItemId: payoutItem._id
          }
        }
      )
      .session(session)
      .exec();

    await this.auditLogService.record(
      {
        eventType: "payout.disbursement",
        actorType: "system",
        actorId: "mpesa",
        outcome: "succeeded",
        resourceType: "payout_item",
        resourceId: toObjectIdString(payoutItem._id),
        metadata: {
          resultCode,
          resultDescription,
          amountCents,
          receipt: transactionReceipt,
          batchId: toObjectIdString(payoutItem.batchId),
          rawEventId: params.metadata.rawEventId,
          requestId: params.metadata.requestId,
          sourceIp: params.metadata.sourceIp
        }
      },
      session
    );

    await this.updateBatchStatus(payoutItem.batchId, session);

    this.logger.info(
      {
        event: "payout.b2c.succeeded",
        payoutItemId: toObjectIdString(payoutItem._id),
        receipt: transactionReceipt,
        amountCents
      },
      "Recorded payout success"
    );
  }

  private async onPayoutFailed(params: {
    payoutItem: PayoutItemDocument;
    metadata: PayoutResultMetadata;
    resultCode: string;
    resultDescription: string | null;
    session: ClientSession;
  }) {
    const { payoutItem, resultCode, resultDescription, session } = params;

    if (payoutItem.status === PayoutItemStatus.Succeeded) {
      return;
    }

    await this.walletModel
      .updateOne(
        { _id: payoutItem.walletId },
        {
          $inc: {
            availableCents: payoutItem.amountCents,
            pendingCents: -payoutItem.amountCents
          }
        }
      )
      .session(session)
      .exec();

    await this.payoutItemModel
      .updateOne(
        { _id: payoutItem._id },
        {
          $set: {
            status: PayoutItemStatus.Failed,
            mpesaResultCode: resultCode,
            mpesaResultDescription: resultDescription,
            lastAttemptAt: new Date(),
            updatedAt: new Date()
          }
        }
      )
      .session(session)
      .exec();

    await this.donationModel
      .updateMany(
        { _id: { $in: payoutItem.donationIds } },
        {
          $set: {
            payoutState: DonationPayoutState.Failed,
            payoutItemId: null,
            payoutBatchId: null,
            paidAt: null
          }
        }
      )
      .session(session)
      .exec();

    await this.auditLogService.record(
      {
        eventType: "payout.disbursement",
        actorType: "system",
        actorId: "mpesa",
        outcome: "failed",
        resourceType: "payout_item",
        resourceId: toObjectIdString(payoutItem._id),
        metadata: {
          resultCode,
          resultDescription,
          batchId: toObjectIdString(payoutItem.batchId),
          rawEventId: params.metadata.rawEventId,
          requestId: params.metadata.requestId,
          sourceIp: params.metadata.sourceIp
        }
      },
      session
    );

    this.logger.warn(
      {
        event: "payout.b2c.failed",
        payoutItemId: toObjectIdString(payoutItem._id),
        resultCode,
        resultDescription
      },
      "Marked payout item as failed"
    );
  }

  private async updateBatchStatus(batchId: Types.ObjectId, session: ClientSession) {
    const [items, batch] = await Promise.all([
      this.payoutItemModel
        .find({ batchId })
        .select({ status: 1 })
        .lean()
        .session(session)
        .exec(),
      this.payoutBatchModel.findById(batchId).session(session).exec()
    ]);

    if (!items?.length || !batch) {
      return;
    }

    const hasPending = items.some(
      (item) => item.status === PayoutItemStatus.Pending || item.status === PayoutItemStatus.Disbursing
    );
    const hasFailed = items.some((item) => item.status === PayoutItemStatus.Failed);
    const allSucceeded = items.every((item) => item.status === PayoutItemStatus.Succeeded);

    const update: Record<string, unknown> = {};

    if (allSucceeded) {
      update.status = PayoutBatchStatus.Paid;
      if (!batch.completedAt) {
        update.completedAt = new Date();
      }
    } else if (hasFailed && !hasPending) {
      update.status = PayoutBatchStatus.Failed;
      if (!batch.completedAt) {
        update.completedAt = new Date();
      }
    } else if (batch.status !== PayoutBatchStatus.Processing) {
      update.status = PayoutBatchStatus.Processing;
      if (!batch.startedAt) {
        update.startedAt = new Date();
      }
    }

    if (Object.keys(update).length === 0) {
      return;
    }

    update.updatedAt = new Date();

    await this.payoutBatchModel
      .updateOne(
        { _id: batchId },
        {
          $set: update
        }
      )
      .session(session)
      .exec();
  }
}

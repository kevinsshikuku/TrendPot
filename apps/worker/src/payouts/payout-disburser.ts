import { Job } from "bullmq";
import { Types } from "mongoose";
import { PayoutDisbursementJob } from "@trendpot/types";
import { workerLogger } from "../logger";
import { connectMongo } from "../mongo";
import { DarajaClient } from "../../../api/src/mpesa/daraja.client";

interface PayoutItemRecord {
  _id: Types.ObjectId;
  batchId: Types.ObjectId;
  walletId: Types.ObjectId;
  creatorUserId: Types.ObjectId;
  donationIds: Types.ObjectId[];
  msisdn: string;
  amountCents: number;
  feeCents?: number;
  currency: string;
  status: string;
  attemptCount: number;
}

const disburserLogger = workerLogger.child({ module: "PayoutDisburser" });

export const createPayoutDisbursementHandler = () => {
  const darajaClient = new DarajaClient();

  return async (job: Job<PayoutDisbursementJob>) => {
    const payoutItemId = new Types.ObjectId(job.data.payoutItemId);
    const mongoose = await connectMongo();
    const session = await mongoose.startSession();
    let payoutItem: PayoutItemRecord | null = null;

    try {
      await session.withTransaction(async () => {
        const db = mongoose.connection.db;
        const items = db.collection<PayoutItemRecord>("payout_items");
        const donations = db.collection("donations");
        const batches = db.collection("payout_batches");

        const existing = await items.findOne({ _id: payoutItemId }, { session });
        if (!existing) {
          disburserLogger.warn(
            { event: "payout.disburser.missing", payoutItemId: payoutItemId.toString() },
            "Payout item not found"
          );
          return;
        }

        if (existing.status === "succeeded") {
          payoutItem = null;
          return;
        }

        const now = new Date();

        await items.updateOne(
          { _id: payoutItemId },
          {
            $set: {
              status: "disbursing",
              lastAttemptAt: now,
              updatedAt: now
            },
            $inc: {
              attemptCount: 1
            }
          },
          { session }
        );

        await donations.updateMany(
          { _id: { $in: existing.donationIds } },
          {
            $set: {
              payoutState: "processing",
              updatedAt: now
            }
          },
          { session }
        );

        await batches.updateOne(
          { _id: existing.batchId },
          {
            $set: {
              status: "processing",
              startedAt: now,
              updatedAt: now
            }
          },
          { session }
        );

        payoutItem = existing;
      });
    } finally {
      await session.endSession();
    }

    if (!payoutItem) {
      return;
    }

    try {
      const amount = Math.round((payoutItem.amountCents ?? 0) / 100);
      if (amount <= 0) {
        throw new Error("Payout amount must be greater than zero.");
      }

      const response = await darajaClient.sendB2CPayout({
        amount,
        phoneNumber: payoutItem.msisdn,
        requestId: job.data.requestId ?? String(job.id),
        logger: disburserLogger
      });

      await mongoose.connection.db.collection("payout_items").updateOne(
        { _id: payoutItem._id },
        {
          $set: {
            mpesaConversationId: response.ConversationID,
            mpesaOriginatorConversationId: response.OriginatorConversationID,
            mpesaResultCode: response.ResponseCode,
            mpesaResultDescription: response.ResponseDescription,
            updatedAt: new Date()
          }
        }
      );

      disburserLogger.info(
        {
          event: "payout.disburser.sent",
          payoutItemId: payoutItem._id.toString(),
          conversationId: response.ConversationID
        },
        "Dispatched B2C payout"
      );
    } catch (error) {
      const now = new Date();
      const errorMessage = (error as Error).message;

      await mongoose.connection.db.collection("payout_items").updateOne(
        { _id: payoutItem._id },
        {
          $set: {
            status: "failed",
            mpesaResultDescription: errorMessage,
            updatedAt: now
          }
        }
      );

      await mongoose.connection.db.collection("donations").updateMany(
        { _id: { $in: payoutItem.donationIds } },
        {
          $set: {
            payoutState: "scheduled",
            updatedAt: now
          }
        }
      );

      disburserLogger.error(
        {
          event: "payout.disburser.failed",
          payoutItemId: payoutItem._id.toString(),
          message: errorMessage
        },
        "Failed to dispatch B2C payout"
      );

      throw error;
    }
  };
};

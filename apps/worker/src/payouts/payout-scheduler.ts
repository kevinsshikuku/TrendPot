import { Queue, JobsOptions, Job } from "bullmq";
import { Types } from "mongoose";
import type { PayoutDisbursementJob, PayoutSchedulingJob } from "@trendpot/types";
import { PAYOUT_DISBURSEMENT_QUEUE } from "@trendpot/types";
import { workerLogger } from "../logger";
import { connectMongo } from "../mongo";

interface SchedulerDependencies {
  disbursementQueue: Queue<PayoutDisbursementJob>;
}

interface DonationRecord {
  _id: Types.ObjectId;
  creatorUserId: Types.ObjectId;
  donorUserId: Types.ObjectId;
  challengeId: Types.ObjectId;
  amountCents: number;
  creatorShareCents: number;
  currency: string;
  donatedAt: Date;
  payoutState: string;
  status: string;
}

interface WalletRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  availableCents: number;
  pendingCents: number;
  currency: string;
}

interface UserRecord {
  _id: Types.ObjectId;
  phone?: string | null;
  status?: string;
}

const DEFAULT_MINIMUM_PAYOUT_CENTS = 5_000;
const DEFAULT_PAYOUT_HOLD_HOURS = 24;
const DEFAULT_MAX_BATCHES_PER_RUN = 5;

const parseIntEnv = (value: string | undefined, fallback: number, min = 0) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(min, parsed);
};

const sanitizeMsisdn = (value: string) => value.replace(/\D/g, "");

const schedulerLogger = workerLogger.child({ module: "PayoutScheduler" });

export const createPayoutSchedulerHandler = ({
  disbursementQueue
}: SchedulerDependencies) => {
  const minimumPayoutCents = parseIntEnv(
    process.env.PAYOUT_MINIMUM_AMOUNT_CENTS,
    DEFAULT_MINIMUM_PAYOUT_CENTS,
    1
  );
  const payoutHoldMs = parseIntEnv(process.env.PAYOUT_HOLD_HOURS, DEFAULT_PAYOUT_HOLD_HOURS, 0) * 60 * 60 * 1000;
  const maxBatchesPerRun = parseIntEnv(
    process.env.PAYOUT_SCHEDULER_MAX_BATCHES,
    DEFAULT_MAX_BATCHES_PER_RUN,
    1
  );

  const disbursementJobOptions: JobsOptions = {
    removeOnComplete: 50,
    attempts: parseIntEnv(process.env.PAYOUT_MAX_ATTEMPTS, 5, 1),
    backoff: { type: "exponential", delay: 5_000 }
  };

  return async (job: Job<PayoutSchedulingJob>) => {
    let processed = 0;
    for (; processed < maxBatchesPerRun; processed++) {
      const scheduled = await scheduleOnce({
        minimumPayoutCents,
        payoutHoldMs,
        disbursementQueue,
        disbursementJobOptions
      });
      if (!scheduled) {
        break;
      }
    }

    schedulerLogger.info(
      {
        event: "payout.scheduler.completed",
        processed,
        requestedAt: job.data.requestedAt,
        reason: job.data.reason
      },
      "Payout scheduler run complete"
    );

    return { processed };
  };
};

interface ScheduleContext {
  minimumPayoutCents: number;
  payoutHoldMs: number;
  disbursementQueue: Queue<PayoutDisbursementJob>;
  disbursementJobOptions: JobsOptions;
}

const scheduleOnce = async ({
  minimumPayoutCents,
  payoutHoldMs,
  disbursementQueue,
  disbursementJobOptions
}: ScheduleContext): Promise<boolean> => {
  const mongoose = await connectMongo();
  const session = await mongoose.startSession();
  let scheduled = false;
  let payoutItemIdForJob: Types.ObjectId | null = null;

  try {
    await session.withTransaction(async () => {
      const db = mongoose.connection.db;
      const donations = db.collection<DonationRecord>("donations");
      const wallets = db.collection<WalletRecord>("wallets");
      const batches = db.collection("payout_batches");
      const items = db.collection("payout_items");
      const users = db.collection<UserRecord>("users");

      const holdCutoff = new Date(Date.now() - payoutHoldMs);

      const candidate = await donations
        .find({
          status: "succeeded",
          payoutState: { $in: ["unassigned", "failed"] },
          donatedAt: { $lte: holdCutoff }
        }, { session })
        .sort({ donatedAt: 1 })
        .limit(1)
        .toArray();

      if (!candidate.length) {
        return;
      }

      const creatorId = candidate[0].creatorUserId;

      const wallet = await wallets.findOne({ userId: creatorId }, { session });
      if (!wallet || wallet.availableCents < minimumPayoutCents) {
        return;
      }

      const creator = await users.findOne({ _id: creatorId }, { session, projection: { phone: 1, status: 1 } });
      if (!creator?.phone) {
        schedulerLogger.warn(
          {
            event: "payout.scheduler.missing_phone",
            creatorId: creatorId.toString()
          },
          "Skipping payout scheduling because creator phone is missing"
        );
        return;
      }

      const normalizedMsisdn = sanitizeMsisdn(creator.phone);
      if (!normalizedMsisdn) {
        return;
      }

      const eligibleDonations = await donations
        .find(
          {
            creatorUserId: creatorId,
            status: "succeeded",
            payoutState: { $in: ["unassigned", "failed"] },
            donatedAt: { $lte: holdCutoff }
          },
          { session }
        )
        .sort({ donatedAt: 1 })
        .toArray();

      if (!eligibleDonations.length) {
        return;
      }

      const totalCreatorShare = eligibleDonations.reduce((acc, donation) => acc + (donation.creatorShareCents ?? 0), 0);

      if (totalCreatorShare < minimumPayoutCents) {
        return;
      }

      const walletUpdate = await wallets.updateOne(
        { _id: wallet._id, availableCents: { $gte: totalCreatorShare } },
        { $inc: { availableCents: -totalCreatorShare, pendingCents: totalCreatorShare } },
        { session }
      );

      if (walletUpdate.modifiedCount === 0) {
        throw new Error("Wallet balance changed before payout scheduling.");
      }

      const donationIds = eligibleDonations.map((donation) => donation._id);
      const periodStart = eligibleDonations[0].donatedAt;
      const periodEnd = eligibleDonations[eligibleDonations.length - 1].donatedAt;
      const currency = eligibleDonations[0].currency ?? wallet.currency ?? "KES";

      const now = new Date();

      const batchInsert = await batches.insertOne(
        {
          creatorUserId: creatorId,
          scheduledFor: now,
          donationCount: eligibleDonations.length,
          totalAmountCents: totalCreatorShare,
          netAmountCents: totalCreatorShare,
          currency,
          status: "scheduled",
          periodStart,
          periodEnd,
          createdAt: now,
          updatedAt: now
        },
        { session }
      );

      const batchId = batchInsert.insertedId as Types.ObjectId;
      const itemInsert = await items.insertOne(
        {
          batchId,
          walletId: wallet._id,
          creatorUserId: creatorId,
          donationIds,
          msisdn: normalizedMsisdn,
          amountCents: totalCreatorShare,
          feeCents: 0,
          currency,
          status: "pending",
          attemptCount: 0,
          createdAt: now,
          updatedAt: now
        },
        { session }
      );

      const payoutItemId = itemInsert.insertedId as Types.ObjectId;

      await donations.updateMany(
        { _id: { $in: donationIds } },
        {
          $set: {
            payoutState: "scheduled",
            payoutBatchId: batchId,
            payoutItemId,
            availableAt: now,
            updatedAt: now
          }
        },
        { session }
      );

      scheduled = true;

      schedulerLogger.info(
        {
          event: "payout.scheduler.scheduled",
          creatorId: creatorId.toString(),
          payoutItemId: payoutItemId.toString(),
          donationCount: eligibleDonations.length,
          amountCents: totalCreatorShare
        },
        "Scheduled creator payout"
      );

      payoutItemIdForJob = payoutItemId;
    });
  } catch (error) {
    schedulerLogger.error(
      { event: "payout.scheduler.error", message: (error as Error).message },
      "Failed to schedule payout batch"
    );
    scheduled = false;
  } finally {
    await session.endSession();
  }

  if (scheduled && payoutItemIdForJob) {
    await disbursementQueue.add(
      `${PAYOUT_DISBURSEMENT_QUEUE}:${payoutItemIdForJob.toString()}`,
      {
        payoutItemId: payoutItemIdForJob.toString(),
        attempt: 0
      },
      disbursementJobOptions
    );
  }

  return scheduled;
};

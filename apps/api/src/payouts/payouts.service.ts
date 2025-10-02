import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Types, type Model } from "mongoose";
import { DonationEntity, type DonationDocument } from "./schemas/donation.schema";
import { PayoutBatchEntity, type PayoutBatchDocument } from "./schemas/payout-batch.schema";
import {
  PayoutNotificationEntity,
  type PayoutNotificationDocument
} from "./schemas/payout-notification.schema";
import { DonationStatus } from "./models/donation-status.enum";
import { DonationPayoutState } from "./models/donation-payout-state.enum";
import { CreatorDonationConnectionModel, CreatorDonationTrendPointModel } from "./models/creator-donation.model";
import { PayoutBatchConnectionModel } from "./models/payout-batch.model";
import { PayoutNotificationConnectionModel } from "./models/payout-notification.model";

interface ConnectionParams {
  first?: number;
  after?: string;
}

@Injectable()
export class PayoutsService {
  constructor(
    @InjectModel(DonationEntity.name)
    private readonly donationModel: Model<DonationDocument>,
    @InjectModel(PayoutBatchEntity.name)
    private readonly payoutBatchModel: Model<PayoutBatchDocument>,
    @InjectModel(PayoutNotificationEntity.name)
    private readonly notificationModel: Model<PayoutNotificationDocument>
  ) {}

  async listCreatorDonations(userId: string, params: ConnectionParams = {}): Promise<CreatorDonationConnectionModel> {
    const creatorId = this.toObjectId(userId);
    const limit = this.sanitizeLimit(params.first ?? 20);
    const cursor = this.parseCursor(params.after);

    const filters: Record<string, unknown>[] = [{ creatorUserId: creatorId }];
    if (cursor) {
      filters.push({ _id: { $lt: cursor } });
    }

    const documents = await this.donationModel
      .find(filters.length ? { $and: filters } : {})
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasNextPage = documents.length > limit;
    const window = hasNextPage ? documents.slice(0, -1) : documents;

    const edges = window.map((doc) => ({
      cursor: doc._id.toString(),
      node: {
        id: doc._id.toString(),
        status: doc.status,
        payoutState: doc.payoutState,
        amountCents: doc.amountCents,
        netAmountCents: Math.max(doc.amountCents - (doc.platformFeeCents ?? 0), 0),
        currency: doc.currency,
        donatedAt: doc.donatedAt,
        availableAt: doc.availableAt ?? null,
        supporterName: doc.supporterName ?? null,
        challengeTitle: doc.challengeTitle ?? null,
        payoutBatchId: doc.payoutBatchId ? String(doc.payoutBatchId) : null,
        payoutItemId: doc.payoutItemId ? String(doc.payoutItemId) : null,
        paidAt: doc.paidAt ?? null
      }
    }));

    const endCursor = edges.length > 0 ? edges[edges.length - 1]?.cursor ?? null : null;

    const [lifetimeSummary] = await this.donationModel.aggregate([
      {
        $match: {
          creatorUserId: creatorId,
          status: DonationStatus.Succeeded
        }
      },
      {
        $group: {
          _id: null,
          amount: { $sum: "$amountCents" },
          count: { $sum: 1 }
        }
      }
    ]);

    const [pendingSummary] = await this.donationModel.aggregate([
      {
        $match: {
          creatorUserId: creatorId,
          status: DonationStatus.Pending
        }
      },
      {
        $group: {
          _id: null,
          amount: { $sum: "$amountCents" }
        }
      }
    ]);

    const [availableSummary] = await this.donationModel.aggregate([
      {
        $match: {
          creatorUserId: creatorId,
          status: DonationStatus.Succeeded,
          payoutState: { $in: [DonationPayoutState.Unassigned, DonationPayoutState.Scheduled, DonationPayoutState.Processing] }
        }
      },
      {
        $group: {
          _id: null,
          amount: { $sum: "$amountCents" }
        }
      }
    ]);

    const trend = await this.buildDonationTrend(creatorId);

    return {
      edges,
      pageInfo: {
        endCursor,
        hasNextPage
      },
      stats: {
        lifetimeAmountCents: lifetimeSummary?.amount ?? 0,
        lifetimeDonationCount: lifetimeSummary?.count ?? 0,
        pendingAmountCents: pendingSummary?.amount ?? 0,
        availableAmountCents: availableSummary?.amount ?? 0
      },
      trend
    };
  }

  async listPayoutBatches(userId: string, params: ConnectionParams = {}): Promise<PayoutBatchConnectionModel> {
    const creatorId = this.toObjectId(userId);
    const limit = this.sanitizeLimit(params.first ?? 10);
    const cursor = this.parseCursor(params.after);

    const filters: Record<string, unknown>[] = [{ creatorUserId: creatorId }];
    if (cursor) {
      filters.push({ _id: { $lt: cursor } });
    }

    const documents = await this.payoutBatchModel
      .find(filters.length ? { $and: filters } : {})
      .sort({ scheduledFor: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasNextPage = documents.length > limit;
    const window = hasNextPage ? documents.slice(0, -1) : documents;

    const edges = window.map((doc) => ({
      cursor: doc._id.toString(),
      node: {
        id: doc._id.toString(),
        status: doc.status,
        scheduledFor: doc.scheduledFor,
        completedAt: doc.completedAt ?? null,
        startedAt: doc.startedAt ?? null,
        donationCount: doc.donationCount,
        totalAmountCents: doc.totalAmountCents,
        netAmountCents: doc.netAmountCents,
        currency: doc.currency,
        periodStart: doc.periodStart ?? null,
        periodEnd: doc.periodEnd ?? null,
        failureReason: doc.failureReason ?? null
      }
    }));

    const endCursor = edges.length > 0 ? edges[edges.length - 1]?.cursor ?? null : null;

    return {
      edges,
      pageInfo: {
        endCursor,
        hasNextPage
      }
    };
  }

  async listNotifications(
    userId: string,
    params: ConnectionParams = {}
  ): Promise<PayoutNotificationConnectionModel> {
    const ownerId = this.toObjectId(userId);
    const limit = this.sanitizeLimit(params.first ?? 15);
    const cursor = this.parseCursor(params.after);

    const filters: Record<string, unknown>[] = [{ userId: ownerId }];
    if (cursor) {
      filters.push({ _id: { $lt: cursor } });
    }

    const documents = await this.notificationModel
      .find(filters.length ? { $and: filters } : {})
      .sort({ eventAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasNextPage = documents.length > limit;
    const window = hasNextPage ? documents.slice(0, -1) : documents;

    const edges = window.map((doc) => ({
      cursor: doc._id.toString(),
      node: {
        id: doc._id.toString(),
        type: doc.type,
        message: doc.message,
        createdAt: doc.createdAt,
        eventAt: doc.eventAt,
        readAt: doc.readAt ?? null,
        metadata: this.normalizeNotificationMetadata(doc.metadata)
      }
    }));

    const endCursor = edges.length > 0 ? edges[edges.length - 1]?.cursor ?? null : null;

    return {
      edges,
      pageInfo: {
        endCursor,
        hasNextPage
      }
    };
  }

  async markNotificationsRead(userId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const ownerId = this.toObjectId(userId);
    const objectIds = ids
      .map((id) => this.parseCursor(id))
      .filter((value): value is Types.ObjectId => Boolean(value));

    if (objectIds.length === 0) {
      return 0;
    }

    const result = await this.notificationModel.updateMany(
      { _id: { $in: objectIds }, userId: ownerId, readAt: null },
      { $set: { readAt: new Date() } }
    );

    return result.modifiedCount ?? 0;
  }

  private sanitizeLimit(limit: number): number {
    if (!Number.isFinite(limit) || limit <= 0) {
      return 20;
    }

    return Math.min(Math.floor(limit), 50);
  }

  private parseCursor(cursor?: string): Types.ObjectId | null {
    if (!cursor || cursor.trim().length === 0) {
      return null;
    }

    if (!Types.ObjectId.isValid(cursor)) {
      return null;
    }

    return new Types.ObjectId(cursor);
  }

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new Error("A valid identifier is required to access creator payouts.");
    }

    return new Types.ObjectId(id);
  }

  private normalizeNotificationMetadata(metadata: Record<string, unknown> | undefined) {
    if (!metadata || typeof metadata !== "object") {
      return null;
    }

    const normalized: Record<string, unknown> = {};

    if (typeof metadata.donationId === "string") {
      normalized.donationId = metadata.donationId;
    }

    if (typeof metadata.payoutBatchId === "string") {
      normalized.payoutBatchId = metadata.payoutBatchId;
    }

    if (typeof metadata.amountCents === "number") {
      normalized.amountCents = metadata.amountCents;
    }

    if (typeof metadata.currency === "string") {
      normalized.currency = metadata.currency;
    }

    return Object.keys(normalized).length > 0 ? normalized : null;
  }

  private async buildDonationTrend(creatorId: Types.ObjectId): Promise<CreatorDonationTrendPointModel[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowDays = 14;
    const start = new Date(today);
    start.setDate(start.getDate() - (windowDays - 1));

    const raw = await this.donationModel.aggregate<{
      _id: string;
      amount: number;
    }>([
      {
        $match: {
          creatorUserId: creatorId,
          status: DonationStatus.Succeeded,
          donatedAt: { $gte: start }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$donatedAt" }
          },
          amount: { $sum: "$amountCents" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const trendMap = new Map(raw.map((entry) => [entry._id, entry.amount]));
    const points: CreatorDonationTrendPointModel[] = [];

    for (let i = 0; i < windowDays; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      points.push({
        date,
        amountCents: trendMap.get(key) ?? 0
      });
    }

    return points;
  }
}

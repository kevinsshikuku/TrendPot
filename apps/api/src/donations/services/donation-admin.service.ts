import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, Model, Types } from "mongoose";
import { DonationEntity, type DonationDocument, DonationStatusHistoryEntry } from "../donation.schema";
import { DonationStatus } from "../donation-status.enum";
import { DonationPayoutState } from "../donation-payout-state.enum";
import { AdminDonationConnectionModel, AdminDonationTotalsModel } from "../models/admin-donation-connection.model";
import { DonationModel } from "../models/donation.model";
import { AdminDonationMetricsModel, AdminDonationTimeBucketModel } from "../models/admin-donation-metrics.model";
import { DonationStatusChangeModel } from "../models/donation-status-change.model";
import { LedgerConfigService } from "../../ledger/ledger.config";
import {
  CompanyLedgerEntryEntity,
  type CompanyLedgerEntryDocument
} from "../../ledger/schemas/company-ledger-entry.schema";

export interface AdminDonationFilter {
  statuses?: DonationStatus[] | null;
  payoutStates?: DonationPayoutState[] | null;
  creatorUserId?: string | null;
  challengeId?: string | null;
  donatedAfter?: Date | null;
  donatedBefore?: Date | null;
}

export interface AdminDonationListParams {
  first?: number | null;
  after?: string | null;
  filter?: AdminDonationFilter | null;
}

const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 100;
const TIMEZONE = "UTC";

interface DonationRecord extends DonationEntity {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

@Injectable()
export class DonationAdminService {
  constructor(
    @InjectModel(DonationEntity.name)
    private readonly donationModel: Model<DonationDocument>,
    @InjectModel(CompanyLedgerEntryEntity.name)
    private readonly companyLedgerModel: Model<CompanyLedgerEntryDocument>,
    private readonly ledgerConfig: LedgerConfigService
  ) {}

  async listDonations(params: AdminDonationListParams = {}): Promise<AdminDonationConnectionModel> {
    const limit = this.sanitizeLimit(params.first);
    const cursor = this.parseCursor(params.after);
    const match = this.buildMatch(params.filter ?? undefined);

    const filters: FilterQuery<DonationDocument>[] = [];
    if (Object.keys(match).length > 0) {
      filters.push(match);
    }
    if (cursor) {
      filters.push({ _id: { $lt: cursor } });
    }

    const query = filters.length > 0 ? { $and: filters } : {};

    const documents = await this.donationModel
      .find(query)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean<DonationRecord[]>();

    const hasNextPage = documents.length > limit;
    const window = hasNextPage ? documents.slice(0, -1) : documents;

    const edges = window.map((doc) => ({
      cursor: doc._id.toString(),
      node: this.mapDonation(doc)
    }));

    const endCursor = edges.length > 0 ? edges[edges.length - 1]?.cursor ?? null : null;

    const totals = await this.computeTotals(match);

    return {
      edges,
      pageInfo: {
        endCursor,
        hasNextPage
      },
      totals
    };
  }

  async getMetrics(filter?: AdminDonationFilter | null): Promise<AdminDonationMetricsModel> {
    const normalizedFilter = this.ensureSucceededDefault(filter ?? undefined);
    const match = this.buildMatch(normalizedFilter);

    const dailyTotals = await this.buildTimeSeries(match, "day", 7);
    const weeklyTotals = await this.buildTimeSeries(match, "week", 8);
    const monthlyTotals = await this.buildTimeSeries(match, "month", 6);

    const [vatSummary] = await this.donationModel.aggregate<{ vat: number }>([
      { $match: match },
      {
        $group: {
          _id: null,
          vat: { $sum: { $ifNull: ["$platformVatCents", 0] } }
        }
      }
    ]);

    const pendingMatch: FilterQuery<DonationDocument> = {
      ...match,
      payoutState: {
        $in:
          normalizedFilter?.payoutStates && normalizedFilter.payoutStates.length > 0
            ? normalizedFilter.payoutStates
            : [
                DonationPayoutState.Unassigned,
                DonationPayoutState.Scheduled,
                DonationPayoutState.Processing
              ]
      }
    };

    const [pendingSummary] = await this.donationModel.aggregate<{ amount: number }>([
      { $match: pendingMatch },
      {
        $group: {
          _id: null,
          amount: { $sum: { $ifNull: ["$creatorShareCents", 0] } }
        }
      }
    ]);

    const [ledgerSummary] = await this.companyLedgerModel.aggregate<{ balance: number }>([
      { $match: { currency: this.ledgerConfig.getLedgerCurrency() } },
      {
        $group: {
          _id: null,
          balance: { $sum: { $ifNull: ["$cashDeltaCents", 0] } }
        }
      }
    ]);

    return {
      dailyTotals,
      weeklyTotals,
      monthlyTotals,
      vatCollectedCents: vatSummary?.vat ?? 0,
      pendingPayoutCents: pendingSummary?.amount ?? 0,
      outstandingClearingBalanceCents: ledgerSummary?.balance ?? 0
    };
  }

  private sanitizeLimit(limit?: number | null): number {
    if (!Number.isFinite(limit) || !limit || limit <= 0) {
      return DEFAULT_LIST_LIMIT;
    }

    return Math.min(Math.floor(limit), MAX_LIST_LIMIT);
  }

  private parseCursor(cursor?: string | null): Types.ObjectId | null {
    if (!cursor || cursor.trim().length === 0) {
      return null;
    }

    if (!Types.ObjectId.isValid(cursor)) {
      throw new BadRequestException("A valid cursor is required for donation pagination.");
    }

    return new Types.ObjectId(cursor);
  }

  private buildMatch(filter?: AdminDonationFilter): FilterQuery<DonationDocument> {
    if (!filter) {
      return {};
    }

    const match: FilterQuery<DonationDocument> = {};

    if (filter.statuses && filter.statuses.length > 0) {
      match.status = { $in: filter.statuses };
    }

    if (filter.payoutStates && filter.payoutStates.length > 0) {
      match.payoutState = { $in: filter.payoutStates };
    }

    if (filter.creatorUserId) {
      match.creatorUserId = this.toObjectId(filter.creatorUserId, "creatorUserId");
    }

    if (filter.challengeId) {
      match.challengeId = this.toObjectId(filter.challengeId, "challengeId");
    }

    if (filter.donatedAfter || filter.donatedBefore) {
      const donatedAt: Record<string, Date> = {};
      if (filter.donatedAfter) {
        donatedAt.$gte = filter.donatedAfter;
      }
      if (filter.donatedBefore) {
        donatedAt.$lt = filter.donatedBefore;
      }
      match.donatedAt = donatedAt;
    }

    return match;
  }

  private ensureSucceededDefault(filter?: AdminDonationFilter): AdminDonationFilter | undefined {
    if (!filter || (filter.statuses && filter.statuses.length > 0)) {
      return filter;
    }

    return { ...filter, statuses: [DonationStatus.Succeeded] };
  }

  private mapDonation(document: DonationRecord): DonationModel {
    const history = Array.isArray(document.statusHistory)
      ? document.statusHistory.map((entry) => this.mapStatusEntry(entry))
      : [];

    return {
      id: document._id.toString(),
      submissionId: String(document.submissionId),
      challengeId: String(document.challengeId),
      creatorUserId: String(document.creatorUserId),
      donorUserId: String(document.donorUserId),
      amountCents: document.amountCents,
      platformFeeCents: document.platformFeeCents ?? 0,
      creatorShareCents: document.creatorShareCents ?? 0,
      platformShareCents: document.platformShareCents ?? 0,
      platformVatCents: document.platformVatCents ?? 0,
      currency: document.currency,
      status: document.status,
      payoutState: document.payoutState,
      payoutBatchId: document.payoutBatchId ? String(document.payoutBatchId) : null,
      payoutItemId: document.payoutItemId ? String(document.payoutItemId) : null,
      availableAt: document.availableAt ?? null,
      paidAt: document.paidAt ?? null,
      statusHistory: history as DonationStatusChangeModel[],
      mpesaCheckoutRequestId: document.mpesaCheckoutRequestId ?? null,
      mpesaMerchantRequestId: document.mpesaMerchantRequestId ?? null,
      failureReason: document.failureReason ?? null,
      lastResponseDescription: document.lastResponseDescription ?? null,
      accountReference: document.accountReference ?? null,
      ledgerJournalEntryId: document.ledgerJournalEntryId?.toString?.() ?? null,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      version: document.__v ?? 0
    };
  }

  private mapStatusEntry(entry: DonationStatusHistoryEntry): DonationStatusChangeModel {
    return {
      status: entry.status,
      occurredAt: entry.occurredAt,
      description: entry.description ?? null
    };
  }

  private async computeTotals(match: FilterQuery<DonationDocument>): Promise<AdminDonationTotalsModel> {
    const [summary] = await this.donationModel.aggregate<{
      count: number;
      grossAmount: number;
      platformFee: number;
      platformShare: number;
      platformVat: number;
      creatorShare: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          grossAmount: { $sum: { $ifNull: ["$amountCents", 0] } },
          platformFee: { $sum: { $ifNull: ["$platformFeeCents", 0] } },
          platformShare: { $sum: { $ifNull: ["$platformShareCents", 0] } },
          platformVat: { $sum: { $ifNull: ["$platformVatCents", 0] } },
          creatorShare: { $sum: { $ifNull: ["$creatorShareCents", 0] } }
        }
      }
    ]);

    return {
      count: summary?.count ?? 0,
      grossAmountCents: summary?.grossAmount ?? 0,
      platformFeeCents: summary?.platformFee ?? 0,
      platformShareCents: summary?.platformShare ?? 0,
      platformVatCents: summary?.platformVat ?? 0,
      creatorShareCents: summary?.creatorShare ?? 0
    };
  }

  private async buildTimeSeries(
    match: FilterQuery<DonationDocument>,
    unit: "day" | "week" | "month",
    periods: number
  ): Promise<AdminDonationTimeBucketModel[]> {
    if (periods <= 0) {
      return [];
    }

    const start = this.calculateSeriesStart(unit, periods);
    const rangeMatch = this.extendDonatedAtLowerBound(match, start);

    const raw = await this.donationModel.aggregate<{ bucket: Date; amount: number }>([
      { $match: rangeMatch },
      {
        $group: {
          _id: {
            $dateTrunc: {
              date: "$donatedAt",
              unit,
              timezone: TIMEZONE
            }
          },
          amount: { $sum: { $ifNull: ["$amountCents", 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          bucket: "$_id",
          amount: "$amount"
        }
      },
      { $sort: { bucket: 1 } }
    ]);

    const bucketMap = new Map<string, number>();
    for (const entry of raw) {
      const key = new Date(entry.bucket).toISOString();
      bucketMap.set(key, entry.amount ?? 0);
    }

    const buckets: AdminDonationTimeBucketModel[] = [];
    for (let index = 0; index < periods; index += 1) {
      const bucketStart = this.advanceInterval(start, unit, index);
      const bucketEnd = this.advanceInterval(bucketStart, unit, 1);
      const amount = bucketMap.get(bucketStart.toISOString()) ?? 0;
      buckets.push({ start: bucketStart, end: bucketEnd, amountCents: amount });
    }

    return buckets;
  }

  private calculateSeriesStart(unit: "day" | "week" | "month", periods: number): Date {
    const now = new Date();
    const anchor = this.truncateDate(now, unit);
    return this.advanceInterval(anchor, unit, -(periods - 1));
  }

  private truncateDate(source: Date, unit: "day" | "week" | "month"): Date {
    const date = new Date(source);
    date.setUTCHours(0, 0, 0, 0);

    if (unit === "week") {
      const day = date.getUTCDay();
      const diff = (day + 6) % 7; // move to Monday
      date.setUTCDate(date.getUTCDate() - diff);
    } else if (unit === "month") {
      date.setUTCDate(1);
    }

    return date;
  }

  private advanceInterval(base: Date, unit: "day" | "week" | "month", offset: number): Date {
    const result = new Date(base);

    if (unit === "day") {
      result.setUTCDate(result.getUTCDate() + offset);
    } else if (unit === "week") {
      result.setUTCDate(result.getUTCDate() + offset * 7);
    } else if (unit === "month") {
      const currentDate = result.getUTCDate();
      result.setUTCDate(1);
      result.setUTCMonth(result.getUTCMonth() + offset);
      const daysInMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
      result.setUTCDate(Math.min(currentDate, daysInMonth));
    }

    return result;
  }

  private extendDonatedAtLowerBound(
    match: FilterQuery<DonationDocument>,
    lowerBound: Date
  ): FilterQuery<DonationDocument> {
    const clone: FilterQuery<DonationDocument> = { ...match };
    const donatedAt = { ...((clone.donatedAt as Record<string, Date>) ?? {}) };

    if (!donatedAt.$gte || donatedAt.$gte < lowerBound) {
      donatedAt.$gte = lowerBound;
    }

    clone.donatedAt = donatedAt;
    return clone;
  }

  private toObjectId(value: string, field: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`A valid ${field} is required.`);
    }

    return new Types.ObjectId(value);
  }
}

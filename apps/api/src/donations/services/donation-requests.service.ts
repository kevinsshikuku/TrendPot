import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash } from "node:crypto";
import { Model, Types } from "mongoose";
import type { Logger as PinoLogger } from "pino";
import { ChallengeEntity } from "../../models/challenge.schema";
import type { ChallengeDocument } from "../../models/challenge.schema";
import { SubmissionEntity, type SubmissionDocument } from "../../models/submission.schema";
import { DarajaClient } from "../../mpesa/daraja.client";
import {
  DonationEntity,
  type DonationDocument,
  DonationStatusHistoryEntry
} from "../donation.schema";
import { DonationPayoutState } from "../donation-payout-state.enum";
import { DonationStatus } from "../donation-status.enum";

interface RequestStkPushParams {
  submissionId: string;
  donorUserId: string;
  amountCents: number;
  msisdn: string;
  idempotencyKey: string;
  accountReference?: string | null;
  narrative?: string | null;
  requestId: string;
  logger: PinoLogger;
}

export interface DonationStatusChange {
  status: DonationStatus;
  occurredAt: Date;
  description: string | null;
}

export interface DonationSnapshot {
  id: string;
  submissionId: string;
  challengeId: string;
  creatorUserId: string;
  donorUserId: string;
  amountCents: number;
  platformFeeCents: number;
  creatorShareCents: number;
  platformShareCents: number;
  platformVatCents: number;
  currency: string;
  status: DonationStatus;
  payoutState: DonationPayoutState;
  statusHistory: DonationStatusChange[];
  mpesaCheckoutRequestId: string | null;
  mpesaMerchantRequestId: string | null;
  failureReason: string | null;
  lastResponseDescription: string | null;
  accountReference: string | null;
  ledgerJournalEntryId: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type DonationRecord = DonationEntity & {
  _id: { toString(): string };
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
  ledgerJournalEntryId?: Types.ObjectId | null;
};

const DEFAULT_TRANSACTION_NARRATIVE = "TrendPot donation";

const hashIdempotencyKey = (key: string) => {
  return createHash("sha256").update(key).digest("hex");
};

const sanitizeMsisdn = (value: string) => value.replace(/\D/g, "");

const sanitizeAccountReference = (value: string) => {
  const trimmed = value.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  if (!trimmed) {
    return "TrendPot";
  }
  return trimmed.slice(0, 20);
};

const sanitizeNarrative = (value: string | null | undefined) => {
  if (!value) {
    return DEFAULT_TRANSACTION_NARRATIVE;
  }
  const normalized = value.trim();
  if (!normalized) {
    return DEFAULT_TRANSACTION_NARRATIVE;
  }
  return normalized.slice(0, 64);
};

const toStatusChange = (entry: DonationStatusHistoryEntry): DonationStatusChange => ({
  status: entry.status,
  occurredAt: entry.occurredAt,
  description: entry.description ?? null
});

const toObjectId = (value: string, field: string) => {
  if (!Types.ObjectId.isValid(value)) {
    throw new BadRequestException(`A valid ${field} is required.`);
  }
  return new Types.ObjectId(value);
};

@Injectable()
export class DonationRequestsService {
  constructor(
    @InjectModel(DonationEntity.name)
    private readonly donationModel: Model<DonationDocument>,
    @InjectModel(SubmissionEntity.name)
    private readonly submissionModel: Model<SubmissionDocument>,
    @InjectModel(ChallengeEntity.name)
    private readonly challengeModel: Model<ChallengeDocument>,
    private readonly darajaClient: DarajaClient
  ) {}

  async requestStkPush(params: RequestStkPushParams): Promise<DonationSnapshot> {
    const amount = Number(params.amountCents);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException("A positive amount in cents is required.");
    }

    if (amount % 100 !== 0) {
      throw new BadRequestException("Donation amounts must be whole shillings (cents divisible by 100).");
    }

    const submission = await this.submissionModel.findById(params.submissionId).lean();
    if (!submission) {
      throw new NotFoundException("Submission could not be located.");
    }

    const challenge = await this.challengeModel.findById(submission.challengeId).lean();
    if (!challenge) {
      throw new NotFoundException("Challenge could not be located for donation.");
    }

    const submissionId = toObjectId(params.submissionId, "submissionId");
    const donorUserId = toObjectId(params.donorUserId, "donorUserId");
    const creatorUserId = toObjectId(String(submission.creatorUserId), "creatorUserId");
    const challengeId = toObjectId(String(submission.challengeId), "challengeId");

    const msisdn = sanitizeMsisdn(params.msisdn);
    if (msisdn.length < 10) {
      throw new BadRequestException("A valid MSISDN is required for the STK push request.");
    }

    const accountReference = sanitizeAccountReference(params.accountReference ?? params.submissionId);
    const narrative = sanitizeNarrative(params.narrative);

    const idempotencyKeyHash = hashIdempotencyKey(params.idempotencyKey);
    const existing = await this.donationModel.findOne({ idempotencyKeyHash }).lean();

    if (existing) {
      params.logger.info({
        event: "donations.idempotent_replay",
        donationId: existing._id?.toString?.() ?? String(existing._id),
        requestId: params.requestId
      });
      return this.toSnapshot(existing as DonationRecord);
    }

    const now = new Date();
    const baseStatusHistory: DonationStatusHistoryEntry[] = [
      { status: DonationStatus.Pending, occurredAt: now, description: "STK push initiated" }
    ];

    const created = await this.donationModel.create({
      submissionId,
      donorUserId,
      creatorUserId,
      challengeId,
      challengeTitle: challenge.title,
      amountCents: amount,
      platformFeeCents: 0,
      creatorShareCents: amount,
      platformShareCents: 0,
      platformVatCents: 0,
      currency: challenge.currency ?? "KES",
      status: DonationStatus.Pending,
      payoutState: DonationPayoutState.Unassigned,
      donatedAt: now,
      statusHistory: baseStatusHistory,
      idempotencyKeyHash,
      accountReference
    });

    const version = created.__v ?? 0;
    params.logger.info({
      event: "donations.stkpush.created",
      donationId: created._id.toString(),
      submissionId: params.submissionId,
      requestId: params.requestId
    });

    try {
      const response = await this.darajaClient.requestStkPush({
        amount: amount / 100,
        phoneNumber: msisdn,
        accountReference,
        description: narrative,
        requestId: params.requestId,
        logger: params.logger
      });

      const statusUpdate: DonationStatusHistoryEntry = {
        status: DonationStatus.Processing,
        occurredAt: new Date(),
        description: response.ResponseDescription
      };

      const updated = await this.donationModel
        .findOneAndUpdate(
          { _id: created._id, __v: version },
          {
            $set: {
              status: DonationStatus.Processing,
              mpesaCheckoutRequestId: response.CheckoutRequestID,
              mpesaMerchantRequestId: response.MerchantRequestID,
              lastResponseDescription: response.ResponseDescription,
              accountReference,
              updatedAt: new Date()
            },
            $push: { statusHistory: statusUpdate },
            $inc: { __v: 1 }
          },
          { new: true }
        )
        .lean();

      const snapshotSource = updated ?? ((await this.donationModel.findById(created._id).lean()) as DonationRecord | null);
      if (!snapshotSource) {
        throw new Error("Donation could not be located after update.");
      }

      return this.toSnapshot(snapshotSource as DonationRecord);
    } catch (error) {
      params.logger.error({
        event: "donations.stkpush.error",
        donationId: created._id.toString(),
        requestId: params.requestId,
        message: (error as Error).message
      });

      await this.donationModel
        .findOneAndUpdate(
          { _id: created._id, __v: version },
          {
            $set: {
              status: DonationStatus.Failed,
              failureReason: (error as Error).message,
              updatedAt: new Date()
            },
            $push: {
              statusHistory: {
                status: DonationStatus.Failed,
                occurredAt: new Date(),
                description: (error as Error).message
              }
            },
            $inc: { __v: 1 }
          }
        )
        .lean()
        .catch(() => undefined);

      throw error;
    }
  }

  async getDonationById(id: string): Promise<DonationSnapshot | null> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("A valid donation id is required.");
    }
    const record = await this.donationModel.findById(id).lean();
    if (!record) {
      return null;
    }
    return this.toSnapshot(record as DonationRecord);
  }

  async getDonationByCheckoutRequestId(checkoutRequestId: string): Promise<DonationSnapshot | null> {
    const record = await this.donationModel.findOne({ mpesaCheckoutRequestId: checkoutRequestId }).lean();
    if (!record) {
      return null;
    }
    return this.toSnapshot(record as DonationRecord);
  }

  private toSnapshot(document: DonationRecord): DonationSnapshot {
    const history = Array.isArray(document.statusHistory)
      ? document.statusHistory.map((entry) => toStatusChange(entry as DonationStatusHistoryEntry))
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
      statusHistory: history,
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
}

import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash } from "node:crypto";
import type { Model } from "mongoose";
import type { Logger as PinoLogger } from "pino";
import { DarajaClient } from "../mpesa/daraja.client";
import { DonationEntity, type DonationDocument, DonationStatus, type DonationStatusHistoryEntry } from "./donation.schema";

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
  donorUserId: string;
  amountCents: number;
  currency: string;
  status: DonationStatus;
  statusHistory: DonationStatusChange[];
  mpesaCheckoutRequestId: string | null;
  mpesaMerchantRequestId: string | null;
  failureReason: string | null;
  lastResponseDescription: string | null;
  accountReference: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

type DonationRecord = DonationEntity & {
  _id: { toString(): string };
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
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

@Injectable()
export class DonationService {
  constructor(
    @InjectModel(DonationEntity.name)
    private readonly donationModel: Model<DonationDocument>,
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
      submissionId: params.submissionId,
      donorUserId: params.donorUserId,
      amountCents: amount,
      currency: "KES",
      status: DonationStatus.Pending,
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
        status: DonationStatus.Submitted,
        occurredAt: new Date(),
        description: response.ResponseDescription
      };

      const updated = await this.donationModel
        .findOneAndUpdate(
          { _id: created._id, __v: version },
          {
            $set: {
              status: DonationStatus.Submitted,
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
      donorUserId: String(document.donorUserId),
      amountCents: document.amountCents,
      currency: document.currency,
      status: document.status,
      statusHistory: history,
      mpesaCheckoutRequestId: document.mpesaCheckoutRequestId ?? null,
      mpesaMerchantRequestId: document.mpesaMerchantRequestId ?? null,
      failureReason: document.failureReason ?? null,
      lastResponseDescription: document.lastResponseDescription ?? null,
      accountReference: document.accountReference ?? null,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      version: document.__v ?? 0
    };
  }
}

import assert from "node:assert/strict";
import test from "node:test";
import type { Model } from "mongoose";
import type { DarajaClient } from "../mpesa/daraja.client";
import type { DonationDocument } from "./donation.schema";
import { DonationStatus } from "./donation.schema";
import { DonationService } from "./donation.service";

type DonationDocLike = {
  _id: string;
  submissionId: string;
  donorUserId: string;
  amountCents: number;
  currency: string;
  status: DonationStatus;
  statusHistory: Array<{ status: DonationStatus; occurredAt: Date; description?: string | null }>;
  idempotencyKeyHash: string;
  mpesaCheckoutRequestId: string | null;
  mpesaMerchantRequestId: string | null;
  failureReason: string | null;
  lastResponseDescription: string | null;
  accountReference: string | null;
  createdAt: Date;
  updatedAt: Date;
  __v: number;
};

class DonationModelStub {
  readonly documents = new Map<string, DonationDocLike>();
  private sequence = 0;

  async create(input: Partial<DonationDocLike> & { idempotencyKeyHash: string }): Promise<DonationDocument> {
    const id = `don-${++this.sequence}`;
    const now = new Date("2024-01-01T00:00:00.000Z");
    const doc: DonationDocLike = {
      _id: id,
      submissionId: String(input.submissionId ?? ""),
      donorUserId: String(input.donorUserId ?? ""),
      amountCents: input.amountCents ?? 0,
      currency: input.currency ?? "KES",
      status: input.status ?? DonationStatus.Pending,
      statusHistory: structuredClone(input.statusHistory ?? []),
      idempotencyKeyHash: input.idempotencyKeyHash,
      mpesaCheckoutRequestId: input.mpesaCheckoutRequestId ?? null,
      mpesaMerchantRequestId: input.mpesaMerchantRequestId ?? null,
      failureReason: input.failureReason ?? null,
      lastResponseDescription: input.lastResponseDescription ?? null,
      accountReference: input.accountReference ?? null,
      createdAt: now,
      updatedAt: now,
      __v: 0
    };

    this.documents.set(id, structuredClone(doc));

    return {
      _id: id,
      __v: doc.__v,
      toObject: () => structuredClone(doc)
    } as unknown as DonationDocument;
  }

  findOne(filter: Record<string, unknown>) {
    const doc = this.findMatchingDoc(filter);
    return {
      lean: async () => (doc ? structuredClone(doc) : null)
    };
  }

  findById(id: unknown) {
    const key = typeof id === "string" ? id : (id as { toString?: () => string })?.toString?.() ?? String(id);
    const doc = this.documents.get(key);
    return {
      lean: async () => (doc ? structuredClone(doc) : null)
    };
  }

  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>, options?: { new?: boolean }) {
    const doc = this.findMatchingDoc(filter);
    return {
      lean: async () => {
        if (!doc) {
          return null;
        }
        const updated = this.applyUpdate(doc, update);
        this.documents.set(doc._id, structuredClone(updated));
        return options?.new ? structuredClone(updated) : structuredClone(doc);
      }
    };
  }

  private findMatchingDoc(filter: Record<string, unknown>) {
    for (const doc of this.documents.values()) {
      if (matchesFilter(doc, filter)) {
        return doc;
      }
    }
    return null;
  }

  private applyUpdate(doc: DonationDocLike, update: Record<string, unknown>) {
    const next = structuredClone(doc);

    if (update.$set && typeof update.$set === "object") {
      for (const [key, value] of Object.entries(update.$set as Record<string, unknown>)) {
        (next as Record<string, unknown>)[key] = value as never;
      }
    }

    if (update.$push && typeof update.$push === "object") {
      for (const [key, value] of Object.entries(update.$push as Record<string, unknown>)) {
        const target = (next as Record<string, unknown>)[key];
        if (Array.isArray(target)) {
          target.push(structuredClone(value));
        } else {
          (next as Record<string, unknown>)[key] = [structuredClone(value)];
        }
      }
    }

    if (update.$inc && typeof update.$inc === "object") {
      for (const [key, value] of Object.entries(update.$inc as Record<string, unknown>)) {
        if (typeof value === "number") {
          const current = (next as Record<string, unknown>)[key];
          (next as Record<string, unknown>)[key] = typeof current === "number" ? (current as number) + value : value;
        }
      }
    }

    if (update.$set && typeof update.$set === "object" && update.$set.updatedAt instanceof Date) {
      next.updatedAt = update.$set.updatedAt;
    }

    return next;
  }
}

class DarajaClientStub {
  readonly requests: Array<Record<string, unknown>> = [];

  async requestStkPush(payload: Record<string, unknown>) {
    this.requests.push(payload);
    return {
      MerchantRequestID: "MERCHANT-123",
      CheckoutRequestID: "CHECKOUT-123",
      ResponseCode: "0",
      ResponseDescription: "Success",
      CustomerMessage: "Success"
    };
  }
}

const createLogger = () => {
  const calls: Record<string, unknown[]> = { info: [], warn: [], error: [] };
  return {
    info: (payload: unknown) => calls.info.push(payload),
    warn: (payload: unknown) => calls.warn.push(payload),
    error: (payload: unknown) => calls.error.push(payload),
    child: () => createLogger(),
    calls
  };
};

const matchesFilter = (doc: DonationDocLike, filter: Record<string, unknown>) => {
  const entries = Object.entries(filter ?? {});
  for (const [key, value] of entries) {
    if (key === "_id") {
      const compare = typeof value === "string" ? value : (value as { toString?: () => string })?.toString?.();
      if (doc._id !== compare) {
        return false;
      }
      continue;
    }
    if (key === "__v") {
      if (doc.__v !== value) {
        return false;
      }
      continue;
    }
    if ((doc as Record<string, unknown>)[key] !== value) {
      return false;
    }
  }
  return true;
};

test("requestStkPush persists a donation and records Daraja checkout identifiers", async () => {
  const model = new DonationModelStub();
  const daraja = new DarajaClientStub();
  const service = new DonationService(model as unknown as Model<DonationDocument>, daraja as unknown as DarajaClient);
  const logger = createLogger();

  const snapshot = await service.requestStkPush({
    submissionId: "sub-1",
    donorUserId: "user-1",
    amountCents: 5_000,
    msisdn: "+254700123456",
    idempotencyKey: "msisdn-sub-1",
    accountReference: "Community Sprint",
    narrative: "Support the creator",
    requestId: "req-1",
    logger
  });

  assert.equal(snapshot.status, DonationStatus.Submitted);
  assert.equal(snapshot.amountCents, 5_000);
  assert.equal(snapshot.mpesaCheckoutRequestId, "CHECKOUT-123");
  assert.equal(snapshot.mpesaMerchantRequestId, "MERCHANT-123");
  assert.equal(snapshot.statusHistory.length, 2);
  assert.deepEqual(
    snapshot.statusHistory.map((entry) => entry.status),
    [DonationStatus.Pending, DonationStatus.Submitted]
  );
  assert.equal(snapshot.version, 1);
  assert.equal(daraja.requests.length, 1);
  assert.equal(daraja.requests[0]?.amount, 50);
  assert.equal(model.documents.size, 1);
});

test("requestStkPush returns the existing donation for duplicate idempotency keys", async () => {
  const model = new DonationModelStub();
  const daraja = new DarajaClientStub();
  const service = new DonationService(model as unknown as Model<DonationDocument>, daraja as unknown as DarajaClient);
  const logger = createLogger();

  const first = await service.requestStkPush({
    submissionId: "sub-2",
    donorUserId: "user-2",
    amountCents: 10_000,
    msisdn: "0700123456",
    idempotencyKey: "duplicate-key",
    requestId: "req-2",
    logger
  });

  const second = await service.requestStkPush({
    submissionId: "sub-2",
    donorUserId: "user-2",
    amountCents: 20_000,
    msisdn: "0700123456",
    idempotencyKey: "duplicate-key",
    requestId: "req-3",
    logger
  });

  assert.equal(first.id, second.id);
  assert.equal(daraja.requests.length, 1);
  assert.equal(model.documents.size, 1);
  assert.equal(second.amountCents, first.amountCents);
  assert.equal(second.version, first.version);
});

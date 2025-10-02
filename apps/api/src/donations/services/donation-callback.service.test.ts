import assert from "node:assert/strict";
import test from "node:test";
import { DonationCallbackService, MpesaStkPushCallbackPayload } from "./donation-callback.service";
import { DonationStatus } from "../donation-status.enum";
import type { SignatureVerificationResult } from "../../webhooks/mpesa-signature.service";

interface DonationRecord {
  _id: string;
  mpesaCheckoutRequestId: string;
  merchantRequestId?: string;
  accountReference?: string;
  amountCents: number;
  mpesaReceipt?: string;
  payerPhone?: string;
  transactionCompletedAt?: Date;
  status: DonationStatus;
  resultCode?: number;
  resultDescription?: string;
  rawCallback?: Record<string, unknown>;
  lastCallbackAt?: Date;
}

class DonationModelStub {
  private sequence = 1;
  readonly documents = new Map<string, DonationRecord>();

  findOne(filter: Record<string, unknown>) {
    const match = this.lookupByFilter(filter);
    const query = {
      session: () => query,
      async exec() {
        return match ? structuredClone(match) : null;
      }
    };

    return query;
  }

  async create(inputs: Array<Partial<DonationRecord>>) {
    return inputs.map((input) => {
      const record: DonationRecord = {
        _id: String(this.sequence++),
        mpesaCheckoutRequestId: input.mpesaCheckoutRequestId ?? "",
        merchantRequestId: input.merchantRequestId,
        amountCents: input.amountCents ?? 0,
        mpesaReceipt: input.mpesaReceipt,
        payerPhone: input.payerPhone,
        accountReference: input.accountReference,
        transactionCompletedAt: input.transactionCompletedAt,
        status: input.status ?? DonationStatus.Pending,
        resultCode: input.resultCode,
        resultDescription: input.resultDescription,
        rawCallback: input.rawCallback,
        lastCallbackAt: input.lastCallbackAt
      };

      this.documents.set(record.mpesaCheckoutRequestId, record);
      return structuredClone(record);
    });
  }

  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>) {
    const match = this.lookupByFilter(filter);
    const documents = this.documents;

    const query = {
      async exec() {
        if (!match) {
          return null;
        }

        const set = (update as { $set?: Partial<DonationRecord> } | undefined)?.$set ?? {};

        const patched: DonationRecord = {
          ...match,
          ...set
        };

        match.amountCents = patched.amountCents;
        match.mpesaReceipt = patched.mpesaReceipt;
        match.payerPhone = patched.payerPhone;
        match.transactionCompletedAt = patched.transactionCompletedAt;
        match.merchantRequestId = patched.merchantRequestId;
        match.accountReference = patched.accountReference;
        match.status = patched.status;
        match.resultCode = patched.resultCode;
        match.resultDescription = patched.resultDescription;
        match.rawCallback = patched.rawCallback;
        match.lastCallbackAt = patched.lastCallbackAt;

        const push = (update as { $push?: { statusHistory?: unknown } } | undefined)?.$push;
        if (push?.statusHistory) {
          if (!Array.isArray((match as { statusHistory?: unknown }).statusHistory)) {
            (match as { statusHistory?: unknown }).statusHistory = [];
          }
          ((match as { statusHistory?: unknown }).statusHistory as unknown[]).push(
            structuredClone(push.statusHistory)
          );
        }

        if (match.mpesaCheckoutRequestId) {
          documents.set(match.mpesaCheckoutRequestId, match);
        }

        return structuredClone(match);
      }
    };

    return query;
  }

  private lookupByFilter(filter: Record<string, unknown>) {
    if (filter.mpesaCheckoutRequestId) {
      return this.documents.get(String(filter.mpesaCheckoutRequestId));
    }

    if (filter._id) {
      const target = String(filter._id);
      return Array.from(this.documents.values()).find((candidate) => candidate._id === target);
    }

    return undefined;
  }
}

class SessionStub {
  async withTransaction(callback: () => Promise<void>) {
    await callback();
  }

  async endSession() {}
}

class ConnectionStub {
  async startSession() {
    return new SessionStub();
  }
}

class AuditLogServiceStub {
  readonly entries: Array<Record<string, unknown>> = [];

  async record(entry: Record<string, unknown>) {
    this.entries.push(entry);
  }
}

const createPayload = (overrides: Partial<MpesaStkPushCallbackPayload> = {}): MpesaStkPushCallbackPayload => ({
  Body: {
    stkCallback: {
      MerchantRequestID: "merchant-1",
      CheckoutRequestID: "checkout-123",
      ResultCode: 0,
      ResultDesc: "Processed",
      CallbackMetadata: {
        Item: [
          { Name: "Amount", Value: 50 },
          { Name: "MpesaReceiptNumber", Value: "ABCD1234" },
          { Name: "PhoneNumber", Value: "254700111222" }
        ]
      },
      ...overrides.Body?.stkCallback
    }
  },
  ...overrides
});

const verification: SignatureVerificationResult = { valid: true };

const connection = new ConnectionStub();

const buildService = (model: DonationModelStub, audit: AuditLogServiceStub) =>
  new DonationCallbackService(connection as never, model as never, audit as never);

const seedDonation = (model: DonationModelStub) => {
  model.documents.set("checkout-123", {
    _id: "1",
    mpesaCheckoutRequestId: "checkout-123",
    merchantRequestId: "merchant-1",
    amountCents: 0,
    status: DonationStatus.Processing
  });
};

test("DonationCallbackService updates existing donations and records audit entries", async () => {
  const model = new DonationModelStub();
  const audit = new AuditLogServiceStub();
  const service = buildService(model, audit);
  seedDonation(model);

  const result = await service.processStkPushCallback(createPayload(), verification, {
    rawEventId: "evt-1"
  });

  assert.equal(result.idempotentReplay, false);
  assert.equal(model.documents.get("checkout-123")?.status, DonationStatus.Succeeded);
  assert.equal(audit.entries.length, 1);
  assert.equal(audit.entries[0]?.outcome, "processed");
});

test("DonationCallbackService marks idempotent replays and avoids duplicate writes", async () => {
  const model = new DonationModelStub();
  const audit = new AuditLogServiceStub();
  const service = buildService(model, audit);
  seedDonation(model);

  await service.processStkPushCallback(createPayload(), verification, {
    rawEventId: "evt-1"
  });

  const replay = await service.processStkPushCallback(createPayload(), verification, {
    rawEventId: "evt-2"
  });

  assert.equal(replay.idempotentReplay, true);
  assert.equal(model.documents.get("checkout-123")?.status, DonationStatus.Succeeded);
  assert.equal(audit.entries.length, 2);
  assert.equal(audit.entries[1]?.outcome, "duplicate");
});

test("DonationCallbackService logs orphaned callbacks when no donation exists", async () => {
  const model = new DonationModelStub();
  const audit = new AuditLogServiceStub();
  const service = buildService(model, audit);

  const result = await service.processStkPushCallback(createPayload(), verification, {
    rawEventId: "evt-3"
  });

  assert.equal(result.donation, null);
  assert.equal(result.idempotentReplay, false);
  assert.equal(audit.entries.length, 1);
  assert.equal(audit.entries[0]?.outcome, "missing");
});

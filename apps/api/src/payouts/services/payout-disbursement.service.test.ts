import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { DonationPayoutState } from "../../donations/donation-payout-state.enum";
import { PayoutItemStatus } from "../models/payout-item-status.enum";
import { PayoutBatchStatus } from "../models/payout-batch-status.enum";
import {
  MpesaB2CResultPayload,
  PayoutDisbursementService,
  type PayoutResultMetadata
} from "./payout-disbursement.service";
import { LedgerService } from "../../ledger/ledger.service";
import { AuditLogService } from "../../audit/audit-log.service";

const clone = <T>(value: T): T => {
  if (value instanceof Types.ObjectId) {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => clone(item)) as unknown as T;
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = clone(nested);
    }
    return result as T;
  }

  return value;
};

const valuesEqual = (left: unknown, right: unknown): boolean => {
  if (left instanceof Types.ObjectId) {
    const leftKey = left.toHexString();
    if (right instanceof Types.ObjectId) {
      return leftKey === right.toHexString();
    }
    return leftKey === String(right);
  }

  if (right instanceof Types.ObjectId) {
    return String(left) === right.toHexString();
  }

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  return left === right;
};

type Filter<T> = Record<string, unknown>;

type Update<T> =
  | { $set?: Partial<T>; $inc?: Partial<Record<keyof T, number>> }
  | ({ [K in keyof T]?: T[K] } & { $set?: never; $inc?: never });

const matchesFilter = <T extends Record<string, unknown>>(doc: T, filter: Filter<T>): boolean => {
  for (const [key, raw] of Object.entries(filter)) {
    if (key === "$or" && Array.isArray(raw)) {
      return raw.some((clause) => matchesFilter(doc, clause as Filter<T>));
    }

    if (raw && typeof raw === "object" && "$in" in (raw as Record<string, unknown>)) {
      const values = (raw as { $in: unknown[] }).$in ?? [];
      const docValue = doc[key];
      if (!values.some((candidate) => valuesEqual(docValue, candidate))) {
        return false;
      }
      continue;
    }

    const docValue = doc[key];
    if (!valuesEqual(docValue, raw)) {
      return false;
    }
  }

  return true;
};

const applyUpdate = <T extends Record<string, unknown>>(doc: T, update: Update<T>) => {
  const set = (update as { $set?: Partial<T> }).$set;
  if (set) {
    for (const [key, value] of Object.entries(set)) {
      (doc as Record<string, unknown>)[key] = value as unknown;
    }
  }

  const inc = (update as { $inc?: Partial<Record<keyof T, number>> }).$inc;
  if (inc) {
    for (const [key, value] of Object.entries(inc)) {
      const numeric = Number(value ?? 0);
      const current = Number((doc as Record<string, unknown>)[key] ?? 0);
      (doc as Record<string, unknown>)[key] = current + numeric;
    }
  }
};

class ChainableQuery<T> {
  private readonly run: () => Promise<T>;

  constructor(executor: () => Promise<T>) {
    this.run = executor;
  }

  session(): this {
    return this;
  }

  lean(): this {
    return this;
  }

  select(): this {
    return this;
  }

  async exec(): Promise<T> {
    return this.run();
  }
}

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
  status: PayoutItemStatus;
  attemptCount: number;
  mpesaConversationId?: string;
  mpesaOriginatorConversationId?: string;
  mpesaResultCode?: string;
  mpesaResultDescription?: string;
  mpesaReceipt?: string;
  ledgerJournalEntryId?: Types.ObjectId;
  lastAttemptAt?: Date;
  updatedAt?: Date;
}

class PayoutItemModelStub {
  private readonly records = new Map<string, PayoutItemRecord>();

  constructor(entries: PayoutItemRecord[]) {
    for (const entry of entries) {
      this.records.set(entry._id.toHexString(), clone(entry));
    }
  }

  findOne(filter: Filter<PayoutItemRecord>) {
    return new ChainableQuery(async () => {
      for (const record of this.records.values()) {
        if (matchesFilter(record as unknown as Record<string, unknown>, filter)) {
          return clone(record);
        }
      }
      return null;
    });
  }

  updateOne(filter: Filter<PayoutItemRecord>, update: Update<PayoutItemRecord>) {
    return new ChainableQuery(async () => {
      let modified = 0;
      for (const record of this.records.values()) {
        if (matchesFilter(record as unknown as Record<string, unknown>, filter)) {
          applyUpdate(record as unknown as Record<string, unknown>, update as Update<Record<string, unknown>>);
          modified++;
        }
      }
      return { acknowledged: true, modifiedCount: modified };
    });
  }

  find(filter: Filter<PayoutItemRecord>) {
    return new ChainableQuery(async () => {
      const results: Array<Pick<PayoutItemRecord, "status">> = [];
      for (const record of this.records.values()) {
        if (matchesFilter(record as unknown as Record<string, unknown>, filter)) {
          results.push({ status: record.status });
        }
      }
      return results;
    });
  }

  getById(id: Types.ObjectId) {
    const found = this.records.get(id.toHexString());
    return found ? clone(found) : undefined;
  }
}

interface PayoutBatchRecord {
  _id: Types.ObjectId;
  status: PayoutBatchStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
  updatedAt?: Date | null;
}

class PayoutBatchModelStub {
  private readonly records = new Map<string, PayoutBatchRecord>();

  constructor(entries: PayoutBatchRecord[]) {
    for (const entry of entries) {
      this.records.set(entry._id.toHexString(), clone(entry));
    }
  }

  findById(id: Types.ObjectId) {
    return new ChainableQuery(async () => {
      const record = this.records.get(id.toHexString());
      return record ? clone(record) : null;
    });
  }

  updateOne(filter: Filter<PayoutBatchRecord>, update: Update<PayoutBatchRecord>) {
    return new ChainableQuery(async () => {
      let modified = 0;
      for (const record of this.records.values()) {
        if (matchesFilter(record as unknown as Record<string, unknown>, filter)) {
          applyUpdate(record as unknown as Record<string, unknown>, update as Update<Record<string, unknown>>);
          modified++;
        }
      }
      return { acknowledged: true, modifiedCount: modified };
    });
  }

  getById(id: Types.ObjectId) {
    const found = this.records.get(id.toHexString());
    return found ? clone(found) : undefined;
  }
}

interface DonationRecord {
  _id: Types.ObjectId;
  payoutState: DonationPayoutState;
  payoutItemId?: Types.ObjectId | null;
  payoutBatchId?: Types.ObjectId | null;
  paidAt?: Date | null;
}

class DonationModelStub {
  private readonly records = new Map<string, DonationRecord>();

  constructor(entries: DonationRecord[]) {
    for (const entry of entries) {
      this.records.set(entry._id.toHexString(), clone(entry));
    }
  }

  updateMany(filter: Filter<DonationRecord>, update: Update<DonationRecord>) {
    return new ChainableQuery(async () => {
      let modified = 0;
      for (const record of this.records.values()) {
        if (matchesFilter(record as unknown as Record<string, unknown>, filter)) {
          applyUpdate(record as unknown as Record<string, unknown>, update as Update<Record<string, unknown>>);
          modified++;
        }
      }
      return { acknowledged: true, modifiedCount: modified };
    });
  }

  getById(id: Types.ObjectId) {
    const found = this.records.get(id.toHexString());
    return found ? clone(found) : undefined;
  }
}

interface WalletRecord {
  _id: Types.ObjectId;
  availableCents: number;
  pendingCents: number;
}

class WalletModelStub {
  private readonly records = new Map<string, WalletRecord>();

  constructor(entries: WalletRecord[]) {
    for (const entry of entries) {
      this.records.set(entry._id.toHexString(), clone(entry));
    }
  }

  updateOne(filter: Filter<WalletRecord>, update: Update<WalletRecord>) {
    return new ChainableQuery(async () => {
      let modified = 0;
      for (const record of this.records.values()) {
        if (matchesFilter(record as unknown as Record<string, unknown>, filter)) {
          applyUpdate(record as unknown as Record<string, unknown>, update as Update<Record<string, unknown>>);
          modified++;
        }
      }
      return { acknowledged: true, modifiedCount: modified };
    });
  }

  getById(id: Types.ObjectId) {
    const found = this.records.get(id.toHexString());
    return found ? clone(found) : undefined;
  }
}

class SessionStub {
  async withTransaction<T>(callback: () => Promise<T>): Promise<T> {
    return callback();
  }

  async endSession() {
    // no-op
  }
}

class ConnectionStub {
  readonly session = new SessionStub();

  async startSession(): Promise<SessionStub> {
    return this.session;
  }
}

class LedgerServiceStub implements Pick<LedgerService, "recordPayoutDisbursement"> {
  readonly calls: Array<{ amountCents: number; payoutItemId: string }> = [];
  journalId = new Types.ObjectId();

  async recordPayoutDisbursement(params: Parameters<LedgerService["recordPayoutDisbursement"]>[0]) {
    this.calls.push({ amountCents: params.amountCents, payoutItemId: params.payoutItemId });
    return { journalEntryId: this.journalId, created: true };
  }
}

class AuditLogServiceStub implements Pick<AuditLogService, "record"> {
  readonly entries: Array<{ eventType: string; outcome: string }> = [];

  async record(entry: { eventType: string; outcome: string }, _session?: unknown) {
    this.entries.push({ eventType: entry.eventType, outcome: entry.outcome });
  }
}

type ServiceArgs = ConstructorParameters<typeof PayoutDisbursementService>;

const buildService = (options: {
  payoutItems: PayoutItemModelStub;
  payoutBatches: PayoutBatchModelStub;
  donations: DonationModelStub;
  wallets: WalletModelStub;
  ledger: LedgerServiceStub;
  audit: AuditLogServiceStub;
}) => {
  const connection = new ConnectionStub();
  return new PayoutDisbursementService(
    connection as unknown as ServiceArgs[0],
    options.payoutItems as unknown as ServiceArgs[1],
    options.payoutBatches as unknown as ServiceArgs[2],
    options.donations as unknown as ServiceArgs[3],
    options.wallets as unknown as ServiceArgs[4],
    options.ledger as unknown as LedgerService,
    options.audit as unknown as AuditLogService
  );
};

test("handleResultCallback posts ledger entries and marks payout as succeeded", async () => {
  const payoutItemId = new Types.ObjectId();
  const batchId = new Types.ObjectId();
  const walletId = new Types.ObjectId();
  const creatorId = new Types.ObjectId();
  const donationId = new Types.ObjectId();
  const transactionTime = new Date("2024-01-02T03:04:05Z");

  const payoutItems = new PayoutItemModelStub([
    {
      _id: payoutItemId,
      batchId,
      walletId,
      creatorUserId: creatorId,
      donationIds: [donationId],
      msisdn: "254700000000",
      amountCents: 25_000,
      feeCents: 0,
      currency: "KES",
      status: PayoutItemStatus.Disbursing,
      attemptCount: 1,
      mpesaConversationId: "CONV123",
      mpesaOriginatorConversationId: "ORIG123"
    }
  ]);

  const payoutBatches = new PayoutBatchModelStub([
    { _id: batchId, status: PayoutBatchStatus.Processing, startedAt: new Date() }
  ]);

  const donations = new DonationModelStub([
    {
      _id: donationId,
      payoutState: DonationPayoutState.Processing,
      payoutBatchId: batchId,
      payoutItemId,
      paidAt: null
    }
  ]);

  const wallets = new WalletModelStub([
    { _id: walletId, availableCents: 0, pendingCents: 25_000 }
  ]);

  const ledger = new LedgerServiceStub();
  const audit = new AuditLogServiceStub();

  const service = buildService({
    payoutItems,
    payoutBatches,
    donations,
    wallets,
    ledger,
    audit
  });

  const payload: MpesaB2CResultPayload = {
    Result: {
      ResultCode: "0",
      ResultDesc: "The service request is processed successfully.",
      ConversationID: "CONV123",
      OriginatorConversationID: "ORIG123",
      TransactionID: "LKJ123",
      ResultParameters: {
        ResultParameter: [
          { Key: "TransactionAmount", Value: "250" },
          { Key: "TransactionCompletedDateTime", Value: transactionTime.toISOString() }
        ]
      }
    }
  };

  const metadata: PayoutResultMetadata = { rawEventId: "event-1" };

  await service.handleResultCallback(payload, metadata);

  assert.equal(ledger.calls.length, 1);
  assert.equal(ledger.calls[0].amountCents, 25_000);
  assert.equal(ledger.calls[0].payoutItemId, payoutItemId.toHexString());

  const updatedItem = payoutItems.getById(payoutItemId);
  assert.equal(updatedItem?.status, PayoutItemStatus.Succeeded);
  assert.equal(updatedItem?.mpesaReceipt, "LKJ123");
  assert.ok(updatedItem?.ledgerJournalEntryId);

  const updatedDonation = donations.getById(donationId);
  assert.equal(updatedDonation?.payoutState, DonationPayoutState.Paid);
  assert.equal(updatedDonation?.paidAt?.toISOString(), transactionTime.toISOString());
  assert.equal(updatedDonation?.payoutItemId?.toHexString(), payoutItemId.toHexString());

  const updatedBatch = payoutBatches.getById(batchId);
  assert.equal(updatedBatch?.status, PayoutBatchStatus.Paid);
  assert(updatedBatch?.completedAt instanceof Date);

  assert.equal(audit.entries.length, 1);
  assert.equal(audit.entries[0].eventType, "payout.disbursement");
  assert.equal(audit.entries[0].outcome, "succeeded");
});

test("handleResultCallback reverts balances when payout fails", async () => {
  const payoutItemId = new Types.ObjectId();
  const batchId = new Types.ObjectId();
  const walletId = new Types.ObjectId();
  const creatorId = new Types.ObjectId();
  const donationId = new Types.ObjectId();

  const payoutItems = new PayoutItemModelStub([
    {
      _id: payoutItemId,
      batchId,
      walletId,
      creatorUserId: creatorId,
      donationIds: [donationId],
      msisdn: "254711111111",
      amountCents: 40_000,
      currency: "KES",
      status: PayoutItemStatus.Disbursing,
      attemptCount: 1,
      mpesaConversationId: "FAIL-CONV"
    }
  ]);

  const payoutBatches = new PayoutBatchModelStub([
    { _id: batchId, status: PayoutBatchStatus.Processing }
  ]);

  const donations = new DonationModelStub([
    {
      _id: donationId,
      payoutState: DonationPayoutState.Processing,
      payoutBatchId: batchId,
      payoutItemId,
      paidAt: null
    }
  ]);

  const wallets = new WalletModelStub([
    { _id: walletId, availableCents: 0, pendingCents: 40_000 }
  ]);

  const ledger = new LedgerServiceStub();
  const audit = new AuditLogServiceStub();

  const service = buildService({
    payoutItems,
    payoutBatches,
    donations,
    wallets,
    ledger,
    audit
  });

  const payload: MpesaB2CResultPayload = {
    Result: {
      ResultCode: "2001",
      ResultDesc: "The initiator information is invalid.",
      ConversationID: "FAIL-CONV"
    }
  };

  const metadata: PayoutResultMetadata = { rawEventId: "event-2" };

  await service.handleResultCallback(payload, metadata);

  assert.equal(ledger.calls.length, 0);

  const updatedItem = payoutItems.getById(payoutItemId);
  assert.equal(updatedItem?.status, PayoutItemStatus.Failed);
  assert.equal(updatedItem?.mpesaResultCode, "2001");

  const updatedDonation = donations.getById(donationId);
  assert.equal(updatedDonation?.payoutState, DonationPayoutState.Failed);
  assert.equal(updatedDonation?.payoutItemId, null);
  assert.equal(updatedDonation?.payoutBatchId, null);
  assert.equal(updatedDonation?.paidAt, null);

  const updatedWallet = wallets.getById(walletId);
  assert.equal(updatedWallet?.availableCents, 40_000);
  assert.equal(updatedWallet?.pendingCents, 0);

  assert.equal(audit.entries.length, 1);
  assert.equal(audit.entries[0].outcome, "failed");
});

import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { LedgerService } from "./ledger.service";

interface JournalRecord {
  _id: Types.ObjectId;
  eventRefId: string;
  eventType: string;
  lines: Array<{ accountCode: string; debitCents: number; creditCents: number }>;
  currency: string;
  postedAt: Date;
}

class JournalModelStub {
  readonly records = new Map<string, JournalRecord>();

  findOne(filter: Record<string, unknown>) {
    const found = [...this.records.values()].find(
      (record) => record.eventType === filter.eventType && record.eventRefId === filter.eventRefId
    );

    const query = {
      session: () => query,
      async exec() {
        return found ? structuredClone(found) : null;
      }
    };

    return query;
  }

  async create(inputs: Array<Omit<JournalRecord, "_id">>, _options: Record<string, unknown>) {
    return inputs.map((input) => {
      const record: JournalRecord = {
        ...structuredClone(input),
        _id: new Types.ObjectId()
      };

      this.records.set(record.eventRefId, record);
      return structuredClone(record);
    });
  }
}

interface WalletRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  availableCents: number;
  pendingCents: number;
  currency: string;
}

class WalletModelStub {
  readonly records = new Map<string, WalletRecord>();

  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>) {
    const userId = (filter.userId as Types.ObjectId).toString();
    let record = this.records.get(userId);

    if (!record) {
      record = {
        _id: new Types.ObjectId(),
        userId: filter.userId as Types.ObjectId,
        availableCents: 0,
        pendingCents: 0,
        currency: (update.$setOnInsert as { currency?: string })?.currency ?? "KES"
      };
    }

    if (update.$inc) {
      const increments = update.$inc as { availableCents?: number; pendingCents?: number };
      record.availableCents += increments.availableCents ?? 0;
      record.pendingCents += increments.pendingCents ?? 0;
    }

    if (update.$setOnInsert) {
      const inserts = update.$setOnInsert as { pendingCents?: number; currency?: string };
      if (typeof inserts.pendingCents === "number") {
        record.pendingCents = inserts.pendingCents;
      }
      if (typeof inserts.currency === "string") {
        record.currency = inserts.currency;
      }
    }

    this.records.set(userId, record);

    const query = {
      async exec() {
        return structuredClone(record);
      }
    };

    return query;
  }
}

class WalletLedgerModelStub {
  readonly entries: Array<{ walletId: Types.ObjectId; journalEntryId: Types.ObjectId; deltaCents: number }> = [];

  async create(inputs: Array<{ walletId: Types.ObjectId; journalEntryId: Types.ObjectId; deltaCents: number }>) {
    for (const input of inputs) {
      this.entries.push(structuredClone(input));
    }
  }
}

class CompanyLedgerModelStub {
  readonly entries: Array<{ journalEntryId: Types.ObjectId; revenueCents: number; vatCents: number; cashDeltaCents: number; currency: string }> = [];

  async create(inputs: Array<{ journalEntryId: Types.ObjectId; revenueCents: number; vatCents: number; cashDeltaCents: number; currency: string }>) {
    for (const input of inputs) {
      this.entries.push(structuredClone(input));
    }
  }
}

class LedgerConfigStub {
  getLedgerCurrency() {
    return "KES";
  }
}

test("recordDonationSuccess posts journal entry, wallet credit, and company ledger entry", async () => {
  const journalModel = new JournalModelStub();
  const walletModel = new WalletModelStub();
  const walletLedgerModel = new WalletLedgerModelStub();
  const companyLedgerModel = new CompanyLedgerModelStub();
  const service = new LedgerService(
    new LedgerConfigStub() as never,
    journalModel as never,
    walletModel as never,
    walletLedgerModel as never,
    companyLedgerModel as never
  );

  const donationId = new Types.ObjectId().toString();
  const creatorId = new Types.ObjectId();
  const session = {} as never;

  const result = await service.recordDonationSuccess({
    session,
    donationId,
    amountCents: 5_000,
    creatorShareCents: 3_500,
    commissionNetCents: 1_293,
    vatCents: 207,
    creatorUserId: creatorId,
    currency: "KES",
    donatedAt: new Date("2024-05-01T12:00:00.000Z")
  });

  assert.ok(result.created);
  const journal = journalModel.records.get(donationId);
  assert.ok(journal);
  assert.equal(journal?.lines.length, 4);
  assert.equal(journal?.lines[0]?.debitCents, 5_000);
  assert.equal(journal?.lines[1]?.creditCents, 3_500);
  assert.equal(journal?.lines[2]?.creditCents, 207);
  assert.equal(journal?.lines[3]?.creditCents, 1_293);

  const wallet = walletModel.records.get(creatorId.toString());
  assert.ok(wallet);
  assert.equal(wallet?.availableCents, 3_500);
  assert.equal(walletLedgerModel.entries.length, 1);
  assert.equal(walletLedgerModel.entries[0]?.deltaCents, 3_500);
  assert.equal(companyLedgerModel.entries.length, 1);
  assert.equal(companyLedgerModel.entries[0]?.revenueCents, 1_293);
  assert.equal(companyLedgerModel.entries[0]?.vatCents, 207);
});

test("recordDonationSuccess is idempotent when journal already exists", async () => {
  const journalModel = new JournalModelStub();
  const walletModel = new WalletModelStub();
  const walletLedgerModel = new WalletLedgerModelStub();
  const companyLedgerModel = new CompanyLedgerModelStub();
  const service = new LedgerService(
    new LedgerConfigStub() as never,
    journalModel as never,
    walletModel as never,
    walletLedgerModel as never,
    companyLedgerModel as never
  );

  const donationId = new Types.ObjectId().toString();
  const creatorId = new Types.ObjectId();
  const session = {} as never;

  await service.recordDonationSuccess({
    session,
    donationId,
    amountCents: 5_000,
    creatorShareCents: 3_500,
    commissionNetCents: 1_293,
    vatCents: 207,
    creatorUserId: creatorId,
    currency: "KES",
    donatedAt: new Date("2024-05-01T12:00:00.000Z")
  });

  const duplicate = await service.recordDonationSuccess({
    session,
    donationId,
    amountCents: 5_000,
    creatorShareCents: 3_500,
    commissionNetCents: 1_293,
    vatCents: 207,
    creatorUserId: creatorId,
    currency: "KES",
    donatedAt: new Date("2024-05-01T12:00:00.000Z")
  });

  assert.equal(duplicate.created, false);
  assert.equal(walletLedgerModel.entries.length, 1);
  assert.equal(companyLedgerModel.entries.length, 1);
  const wallet = walletModel.records.get(creatorId.toString());
  assert.ok(wallet);
  assert.equal(wallet?.availableCents, 3_500);
});

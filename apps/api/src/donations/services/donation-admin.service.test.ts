import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { DonationAdminService } from "./donation-admin.service";
import { DonationStatus } from "../donation-status.enum";
import { DonationPayoutState } from "../donation-payout-state.enum";

class DonationModelStub {
  documents: any[] = [];
  aggregateResponses: any[][] = [];
  findCalls: unknown[] = [];
  aggregateCalls: unknown[] = [];

  find(filter: unknown) {
    this.findCalls.push(filter);
    const docs = this.documents;
    return {
      sort: () => ({
        limit: (limit: number) => ({
          lean: async () => docs.slice(0, limit)
        })
      })
    };
  }

  async aggregate(pipeline: unknown) {
    this.aggregateCalls.push(pipeline);
    return this.aggregateResponses.shift() ?? [];
  }
}

class CompanyLedgerModelStub {
  aggregateResponses: any[][] = [];
  aggregateCalls: unknown[] = [];

  async aggregate(pipeline: unknown) {
    this.aggregateCalls.push(pipeline);
    return this.aggregateResponses.shift() ?? [];
  }
}

class LedgerConfigStub {
  constructor(private readonly currency: string) {}
  getLedgerCurrency() {
    return this.currency;
  }
}

const buildDonation = (overrides: Partial<Record<string, unknown>> = {}) => ({
  _id: new Types.ObjectId(),
  submissionId: new Types.ObjectId(),
  challengeId: new Types.ObjectId(),
  creatorUserId: new Types.ObjectId(),
  donorUserId: new Types.ObjectId(),
  amountCents: 5000,
  platformFeeCents: 1500,
  platformShareCents: 1200,
  platformVatCents: 300,
  creatorShareCents: 3500,
  currency: "KES",
  status: DonationStatus.Succeeded,
  payoutState: DonationPayoutState.Unassigned,
  donatedAt: new Date("2024-05-01T10:00:00.000Z"),
  availableAt: null,
  paidAt: null,
  statusHistory: [],
  createdAt: new Date("2024-05-01T10:00:00.000Z"),
  updatedAt: new Date("2024-05-01T10:05:00.000Z"),
  __v: 0,
  ...overrides
});

test("DonationAdminService returns paginated donations with totals", async () => {
  const donationModel = new DonationModelStub();
  const ledgerModel = new CompanyLedgerModelStub();
  const ledgerConfig = new LedgerConfigStub("KES");

  const first = buildDonation();
  const second = buildDonation({ amountCents: 6000, creatorShareCents: 4200 });
  const third = buildDonation({ amountCents: 7000, creatorShareCents: 4800 });
  donationModel.documents = [first, second, third];
  donationModel.aggregateResponses = [
    [
      {
        count: 3,
        grossAmount: 18000,
        platformFee: 4500,
        platformShare: 3600,
        platformVat: 900,
        creatorShare: 12500
      }
    ]
  ];

  const service = new DonationAdminService(
    donationModel as never,
    ledgerModel as never,
    ledgerConfig as never
  );

  const result = await service.listDonations({
    first: 2,
    filter: { statuses: [DonationStatus.Succeeded] }
  });

  assert.equal(result.edges.length, 2);
  assert.equal(result.pageInfo.hasNextPage, true);
  assert.equal(result.totals.count, 3);
  assert.equal(result.totals.grossAmountCents, 18000);
  assert.deepEqual(donationModel.findCalls[0], {
    $and: [{ status: { $in: [DonationStatus.Succeeded] } }]
  });
});

test("DonationAdminService metrics include aggregates and ledger balance", async () => {
  const donationModel = new DonationModelStub();
  const ledgerModel = new CompanyLedgerModelStub();
  const ledgerConfig = new LedgerConfigStub("KES");

  donationModel.aggregateResponses = [
    [{ bucket: new Date("2024-05-01T00:00:00.000Z"), amount: 10000 }],
    [],
    [],
    [{ vat: 1600 }],
    [{ amount: 3200 }]
  ];

  ledgerModel.aggregateResponses = [[{ balance: 5400 }]];

  const service = new DonationAdminService(
    donationModel as never,
    ledgerModel as never,
    ledgerConfig as never
  );

  const metrics = await service.getMetrics({});

  assert.equal(metrics.dailyTotals.length, 7);
  assert.equal(metrics.weeklyTotals.length, 8);
  assert.equal(metrics.monthlyTotals.length, 6);
  assert.equal(metrics.vatCollectedCents, 1600);
  assert.equal(metrics.pendingPayoutCents, 3200);
  assert.equal(metrics.outstandingClearingBalanceCents, 5400);

  assert.equal(donationModel.aggregateCalls.length, 5);
  assert.equal(ledgerModel.aggregateCalls.length, 1);
  const ledgerMatch = (ledgerModel.aggregateCalls[0] as Array<Record<string, unknown>>)[0];
  assert.deepEqual(ledgerMatch, { $match: { currency: "KES" } });
});

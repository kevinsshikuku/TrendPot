import assert from "node:assert/strict";
import test from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { DonationResolver } from "./donation.resolver";

class DonationRequestsStub {
  readonly requests: Array<Record<string, unknown>> = [];

  async requestStkPush(input: Record<string, unknown>) {
    this.requests.push(input);
    return { id: "donation-1", ...input };
  }

  async getDonationById(id: string) {
    return { id };
  }

  async getDonationByCheckoutRequestId(checkoutRequestId: string) {
    return { id: checkoutRequestId };
  }
}

class DonationAdminStub {
  readonly listCalls: Array<Record<string, unknown>> = [];
  readonly metricsCalls: Array<Record<string, unknown>> = [];

  async listDonations(params: Record<string, unknown>) {
    this.listCalls.push(params);
    return {
      edges: [],
      pageInfo: { hasNextPage: false, endCursor: null },
      totals: {
        count: 0,
        grossAmountCents: 0,
        creatorShareCents: 0,
        platformShareCents: 0,
        platformFeeCents: 0,
        platformVatCents: 0
      }
    };
  }

  async getMetrics(filter: Record<string, unknown> | undefined) {
    this.metricsCalls.push(filter ?? {});
    return {
      vatCollectedCents: 207,
      pendingPayoutCents: 1_000,
      outstandingClearingBalanceCents: 0,
      dailyTotals: [],
      weeklyTotals: [],
      monthlyTotals: []
    };
  }
}

class AuditLogServiceStub {
  readonly entries: Array<Record<string, unknown>> = [];

  async record(entry: Record<string, unknown>) {
    this.entries.push(entry);
  }
}

const createContext = (overrides: Record<string, unknown> = {}) => ({
  user: { id: "user-1", roles: ["admin"] },
  requestId: "req-1",
  logger: { child: () => ({}) },
  ...overrides
});

test("adminDonations throws when unauthenticated", async () => {
  const resolver = new DonationResolver(
    new DonationRequestsStub() as never,
    new DonationAdminStub() as never,
    new AuditLogServiceStub() as never
  );

  await assert.rejects(() => resolver.adminDonations(createContext({ user: undefined }), 10, undefined, undefined), (error) => {
    assert.ok(error instanceof UnauthorizedException);
    return true;
  });
});

test("adminDonations records audit events on success", async () => {
  const donationRequests = new DonationRequestsStub();
  const donationAdmin = new DonationAdminStub();
  const audit = new AuditLogServiceStub();
  const resolver = new DonationResolver(
    donationRequests as never,
    donationAdmin as never,
    audit as never
  );

  const result = await resolver.adminDonations(
    createContext(),
    20,
    "cursor-1",
    { statuses: ["succeeded"], creatorUserId: "creator-123" }
  );

  assert.equal(result.totals.count, 0);
  assert.equal(donationAdmin.listCalls.length, 1);
  assert.equal(audit.entries.length, 1);
  assert.equal(audit.entries[0]?.eventType, "donation.admin.list");
  assert.equal(audit.entries[0]?.outcome, "succeeded");
  assert.equal(audit.entries[0]?.metadata?.first, 20);
  assert.equal(audit.entries[0]?.metadata?.after, "cursor-1");
  assert.deepEqual(audit.entries[0]?.metadata?.filter, {
    statuses: ["succeeded"],
    creatorUserId: "creator-123"
  });
});

test("adminDonations records failure audit entries", async () => {
  const donationRequests = new DonationRequestsStub();
  const donationAdmin = new DonationAdminStub();
  const audit = new AuditLogServiceStub();
  donationAdmin.listDonations = async () => {
    throw new Error("boom");
  };

  const resolver = new DonationResolver(
    donationRequests as never,
    donationAdmin as never,
    audit as never
  );

  await assert.rejects(
    () => resolver.adminDonations(createContext(), undefined, undefined, undefined),
    /boom/
  );

  assert.equal(audit.entries.length, 1);
  assert.equal(audit.entries[0]?.outcome, "failed");
  assert.equal(audit.entries[0]?.eventType, "donation.admin.list");
});

test("adminDonationMetrics records audit events and forwards filters", async () => {
  const donationRequests = new DonationRequestsStub();
  const donationAdmin = new DonationAdminStub();
  const audit = new AuditLogServiceStub();
  const resolver = new DonationResolver(
    donationRequests as never,
    donationAdmin as never,
    audit as never
  );

  const metrics = await resolver.adminDonationMetrics(createContext(), {
    statuses: ["succeeded"],
    payoutStates: ["unassigned"],
    donatedAfter: new Date("2024-01-01T00:00:00.000Z")
  });

  assert.equal(metrics.vatCollectedCents, 207);
  assert.equal(donationAdmin.metricsCalls.length, 1);
  assert.equal(audit.entries.length, 1);
  assert.equal(audit.entries[0]?.eventType, "donation.admin.metrics");
  assert.equal(audit.entries[0]?.outcome, "succeeded");
});

test("serializeFilter trims empty values", () => {
  const resolver = new DonationResolver(
    new DonationRequestsStub() as never,
    new DonationAdminStub() as never,
    new AuditLogServiceStub() as never
  );

  const serialized = (resolver as unknown as {
    serializeFilter(
      filter?: Record<string, unknown>
    ): Record<string, unknown> | null;
  }).serializeFilter({
    statuses: [],
    payoutStates: [],
    creatorUserId: "",
    challengeId: null
  });

  assert.equal(serialized, null);
});

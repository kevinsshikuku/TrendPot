import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AdminDonationFilterInput } from "@trendpot/types";
import { normalizeAdminDonationFilter, normalizeAdminDonationsParams } from "./admin-donation-queries";

describe("admin-donation-queries", () => {
  it("normalizes filter values and sorts enums", () => {
    const filter: AdminDonationFilterInput = {
      statuses: ["failed", "pending", "failed"],
      payoutStates: ["processing", "scheduled"],
      challengeId: "  challenge-123  ",
      creatorUserId: "creator-456",
      donatedAfter: new Date("2024-04-01T00:00:00Z"),
      donatedBefore: "2024-04-10T23:59:59Z"
    };

    const normalized = normalizeAdminDonationFilter(filter);

    assert.ok(normalized);
    assert.deepEqual(normalized?.statuses, ["failed", "pending"]);
    assert.deepEqual(normalized?.payoutStates, ["processing", "scheduled"]);
    assert.equal(normalized?.challengeId, "challenge-123");
    assert.equal(normalized?.creatorUserId, "creator-456");
    assert.equal(normalized?.donatedAfter, new Date("2024-04-01T00:00:00Z").toISOString());
    assert.equal(normalized?.donatedBefore, new Date("2024-04-10T23:59:59Z").toISOString());
  });

  it("returns undefined when no filters are provided", () => {
    assert.equal(normalizeAdminDonationFilter({}), undefined);
  });

  it("normalizes params including pagination cursor", () => {
    const params = normalizeAdminDonationsParams({
      first: 25,
      after: "  cursor123  ",
      filter: {
        statuses: ["succeeded"],
        donatedAfter: "2024-05-01T12:00:00Z"
      }
    });

    assert.equal(params.first, 25);
    assert.equal(params.after, "cursor123");
    assert.equal(params.filter?.statuses?.[0], "succeeded");
    assert.equal(params.filter?.donatedAfter, "2024-05-01T12:00:00.000Z");
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import type { CreatorDonationConnection } from "@trendpot/types";
import { GraphQLRequestError, apiClient } from "./api-client";
import {
  creatorDonationsQueryOptions,
  fetchCreatorDonations,
  markPayoutNotificationsRead,
  payoutNotificationsQueryOptions
} from "./payouts-queries";

const sampleDonations: CreatorDonationConnection = {
  edges: [],
  pageInfo: { endCursor: null, hasNextPage: false },
  stats: {
    lifetimeAmountCents: 0,
    lifetimeDonationCount: 0,
    pendingAmountCents: 0,
    availableAmountCents: 0
  },
  trend: []
};

test("fetchCreatorDonations forwards params to the API client", async () => {
  const original = apiClient.getCreatorDonations;
  apiClient.getCreatorDonations = (async (params) => {
    assert.deepEqual(params, { first: 5 });
    return sampleDonations;
  }) as typeof original;

  const result = await fetchCreatorDonations({ first: 5 });
  assert.equal(result, sampleDonations);

  apiClient.getCreatorDonations = original;
});

test("creatorDonationsQueryOptions provides a stable query key", () => {
  const options = creatorDonationsQueryOptions({ first: 10 });
  assert.deepEqual(options.queryKey, ["payouts", "creator", "donations", { first: 10 }]);
});

test("markPayoutNotificationsRead wraps GraphQL errors", async () => {
  const original = apiClient.markPayoutNotificationsRead;
  apiClient.markPayoutNotificationsRead = (async () => {
    throw new GraphQLRequestError([{ message: "Failure" }]);
  }) as typeof original;

  await assert.rejects(() => markPayoutNotificationsRead(["1"]), /Failure/);

  apiClient.markPayoutNotificationsRead = original;
});

test("notification query options configure polling", () => {
  const options = payoutNotificationsQueryOptions({ first: 3 });
  assert.equal(options.refetchInterval, 1000 * 30);
  assert.deepEqual(options.queryKey, ["payouts", "creator", "notifications", { first: 3 }]);
});

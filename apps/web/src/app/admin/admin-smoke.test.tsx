import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type { AdminDonationConnection, AdminDonationMetrics } from "@trendpot/types";
import { adminDonationsQueryOptions, adminDonationMetricsQueryOptions } from "@/lib/admin-donation-queries";
import { apiClient } from "@/lib/api-client";

const sampleConnection: AdminDonationConnection = {
  edges: [
    {
      cursor: "cursor-1",
      node: {
        id: "don-1",
        status: "succeeded",
        payoutState: "unassigned",
        amountCents: 5_000,
        creatorShareCents: 3_500,
        platformShareCents: 1_293,
        platformFeeCents: 1_500,
        platformVatCents: 207,
        currency: "KES",
        challengeId: "chal-1",
        submissionId: "sub-1",
        creatorUserId: "creator-1",
        donorUserId: "donor-1",
        donorDisplayName: "Jane Fan",
        ledgerJournalEntryId: "journal-1",
        mpesaCheckoutRequestId: "checkout-1",
        mpesaMerchantRequestId: "merchant-1",
        payoutBatchId: null,
        payoutItemId: null,
        createdAt: new Date("2024-05-01T12:00:00Z").toISOString()
      }
    }
  ],
  pageInfo: { hasNextPage: false, endCursor: "cursor-1" },
  totals: {
    count: 1,
    grossAmountCents: 5_000,
    creatorShareCents: 3_500,
    platformShareCents: 1_293,
    platformFeeCents: 1_500,
    platformVatCents: 207
  }
};

const sampleMetrics: AdminDonationMetrics = {
  vatCollectedCents: 207,
  pendingPayoutCents: 3_500,
  outstandingClearingBalanceCents: 0,
  dailyTotals: [{ start: "2024-05-01", end: "2024-05-01", amountCents: 5_000 }],
  weeklyTotals: [{ start: "2024-04-29", end: "2024-05-05", amountCents: 5_000 }],
  monthlyTotals: [{ start: "2024-05-01", end: "2024-05-31", amountCents: 5_000 }]
};

test("admin dashboards prefetch donate and metrics data into QueryClient", async (t) => {
  const originalList = apiClient.listAdminDonations.bind(apiClient);
  const originalMetrics = apiClient.getAdminDonationMetrics.bind(apiClient);

  (apiClient as { listAdminDonations: typeof apiClient.listAdminDonations }).listAdminDonations = async () => sampleConnection;
  (apiClient as { getAdminDonationMetrics: typeof apiClient.getAdminDonationMetrics }).getAdminDonationMetrics = async () =>
    sampleMetrics;

  t.after(() => {
    (apiClient as { listAdminDonations: typeof apiClient.listAdminDonations }).listAdminDonations = originalList;
    (apiClient as { getAdminDonationMetrics: typeof apiClient.getAdminDonationMetrics }).getAdminDonationMetrics = originalMetrics;
  });

  const donationsClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0
      }
    }
  });

  const metricsClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        cacheTime: 0
      }
    }
  });

  const donationsOptions = adminDonationsQueryOptions({ first: 25 });
  const metricsOptions = adminDonationMetricsQueryOptions();

  const fetchedConnection = await donationsClient.fetchQuery(donationsOptions);
  const fetchedMetrics = await metricsClient.fetchQuery(metricsOptions);

  assert.equal(fetchedConnection.totals.count, 1);
  assert.equal(fetchedConnection.edges[0]?.node.mpesaCheckoutRequestId, "checkout-1");
  assert.equal(fetchedMetrics.pendingPayoutCents, 3_500);
  assert.equal(fetchedMetrics.dailyTotals.length, 1);

  assert.deepEqual(donationsClient.getQueryData(donationsOptions.queryKey), sampleConnection);
  assert.deepEqual(metricsClient.getQueryData(metricsOptions.queryKey), sampleMetrics);
});

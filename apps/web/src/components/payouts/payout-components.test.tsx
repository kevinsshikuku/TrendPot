import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { CreatorDonationConnection, PayoutNotificationConnection } from "@trendpot/types";
import { CreatorEarningsSummary } from "./creator-earnings-summary";
import { PayoutNotificationCenter } from "./payout-notification-center";

const sampleDonationConnection: CreatorDonationConnection = {
  edges: [
    {
      cursor: "1",
      node: {
        id: "1",
        status: "succeeded",
        payoutState: "scheduled",
        amountCents: 50000,
        netAmountCents: 45000,
        currency: "KES",
        donatedAt: new Date("2024-05-01T12:00:00Z").toISOString(),
        availableAt: null,
        supporterName: "Ada",
        challengeTitle: "May fundraiser",
        payoutBatchId: "batch-1"
      }
    }
  ],
  pageInfo: { endCursor: "1", hasNextPage: false },
  stats: {
    lifetimeAmountCents: 50000,
    lifetimeDonationCount: 1,
    pendingAmountCents: 0,
    availableAmountCents: 45000
  },
  trend: [
    { date: new Date("2024-04-30T00:00:00Z").toISOString(), amountCents: 0 },
    { date: new Date("2024-05-01T00:00:00Z").toISOString(), amountCents: 50000 }
  ]
};

const sampleNotifications: PayoutNotificationConnection = {
  edges: [
    {
      cursor: "n1",
      node: {
        id: "n1",
        type: "payout.scheduled",
        message: "KES 450 scheduled for Friday",
        createdAt: new Date("2024-05-02T10:00:00Z").toISOString(),
        eventAt: new Date("2024-05-02T10:00:00Z").toISOString(),
        readAt: null,
        metadata: {
          payoutBatchId: "batch-1",
          amountCents: 45000,
          currency: "KES"
        }
      }
    }
  ],
  pageInfo: { endCursor: "n1", hasNextPage: false }
};

test("CreatorEarningsSummary highlights total earnings", () => {
  const markup = renderToStaticMarkup(
    <CreatorEarningsSummary connection={sampleDonationConnection} isLoading={false} />
  );

  assert(markup.includes("Earnings overview"));
  assert(markup.includes("Lifetime earnings"));
  assert(markup.includes("KES"));
});

test("Notification center renders mark all control", () => {
  const markup = renderToStaticMarkup(
    <PayoutNotificationCenter connection={sampleNotifications} isLoading={false} />
  );

  assert(markup.includes("Mark all read"));
  assert(markup.includes("Payout alerts"));
});

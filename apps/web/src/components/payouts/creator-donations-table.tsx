"use client";

import { Button, Card, CardContent, CardHeader } from "@trendpot/ui";
import type { CreatorDonationConnection } from "@trendpot/types";
import { formatCurrencyFromCents } from "@/lib/money";

interface CreatorDonationsTableProps {
  connection: CreatorDonationConnection | undefined;
  isLoading: boolean;
  onLoadMore?: () => void;
  isFetchingMore?: boolean;
}

const describePayoutState = (state: string) => {
  switch (state) {
    case "unassigned":
      return "Queued";
    case "scheduled":
      return "Scheduled";
    case "processing":
      return "Processing";
    case "paid":
      return "Paid out";
    case "failed":
      return "Failed";
    default:
      return state;
  }
};

export function CreatorDonationsTable({
  connection,
  isLoading,
  onLoadMore,
  isFetchingMore,
}: CreatorDonationsTableProps) {
  const donations = connection?.edges ?? [];
  const currency = donations[0]?.node.currency ?? "KES";
  const canLoadMore = Boolean(connection?.pageInfo.hasNextPage && onLoadMore);

  return (
    <Card className="overflow-hidden" aria-busy={isLoading}>
      <CardHeader className="gap-2">
        <h2 className="text-lg font-semibold text-slate-100">Recent donations</h2>
        <p className="text-sm text-slate-400">Detailed ledger of supporter contributions.</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 text-left" aria-live="polite">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-3">Supporter</th>
              <th scope="col" className="px-4 py-3">Amount</th>
              <th scope="col" className="px-4 py-3">Net</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Payout</th>
              <th scope="col" className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-900/60 text-sm text-slate-200">
            {donations.map(({ node }) => {
              const amount = formatCurrencyFromCents(node.amountCents, node.currency ?? currency);
              const netAmount = formatCurrencyFromCents(node.netAmountCents, node.currency ?? currency);
              const donatedAt = new Date(node.donatedAt).toLocaleString();
              const payoutState = describePayoutState(node.payoutState);

              return (
                <tr key={node.id} className="bg-slate-950/40">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-100">{node.supporterName ?? "Anonymous"}</span>
                      {node.challengeTitle ? (
                        <span className="text-xs text-slate-500">Challenge · {node.challengeTitle}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">{amount}</td>
                  <td className="px-4 py-3">{netAmount}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 uppercase">
                      {node.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{payoutState}</td>
                  <td className="px-4 py-3 text-slate-400">{donatedAt}</td>
                </tr>
              );
            })}
            {donations.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No donations have been recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {canLoadMore ? (
          <div className="mt-6 flex justify-center">
            <Button onClick={onLoadMore} disabled={isFetchingMore} aria-live="polite">
              {isFetchingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

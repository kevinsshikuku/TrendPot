"use client";

import { Card, CardContent, CardHeader } from "@trendpot/ui";
import type { PayoutBatchConnection } from "@trendpot/types";
import { formatCurrencyFromCents } from "@/lib/money";

interface PayoutBatchesCardProps {
  connection: PayoutBatchConnection | undefined;
  isLoading: boolean;
}

const describeStatus = (status: string) => {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "processing":
      return "Processing";
    case "paid":
      return "Paid";
    case "failed":
      return "Needs attention";
    default:
      return status;
  }
};

export function PayoutBatchesCard({ connection, isLoading }: PayoutBatchesCardProps) {
  const batches = connection?.edges ?? [];
  const currency = batches[0]?.node.currency ?? "KES";

  return (
    <Card aria-busy={isLoading} className="flex flex-col overflow-hidden">
      <CardHeader className="gap-2">
        <h2 className="text-lg font-semibold text-slate-100">Upcoming payouts</h2>
        <p className="text-sm text-slate-400">
          Your next disbursements and their processing status.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-slate-800" aria-live="polite">
          {batches.slice(0, 4).map(({ node }) => {
            const statusLabel = describeStatus(node.status);
            const amount = formatCurrencyFromCents(node.netAmountCents, node.currency ?? currency);
            const scheduledDate = new Date(node.scheduledFor).toLocaleString();

            return (
              <li key={node.id} className="py-4 first:pt-0 last:pb-0">
                <article className="flex flex-col gap-2" aria-label={`Payout ${statusLabel}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-slate-100">{amount}</h3>
                    <span
                      className="rounded-full border border-emerald-400/50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-emerald-300"
                      aria-label={`Status: ${statusLabel}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <dl className="grid grid-cols-1 gap-2 text-sm text-slate-400 sm:grid-cols-3">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Scheduled for</dt>
                      <dd className="mt-1 text-slate-200">{scheduledDate}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Donations</dt>
                      <dd className="mt-1 text-slate-200">{node.donationCount.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Gross amount</dt>
                      <dd className="mt-1 text-slate-200">
                        {formatCurrencyFromCents(node.totalAmountCents, node.currency ?? currency)}
                      </dd>
                    </div>
                  </dl>
                  {node.failureReason ? (
                    <p className="rounded-xl bg-rose-900/40 px-4 py-3 text-xs text-rose-200" role="status">
                      {node.failureReason}
                    </p>
                  ) : null}
                </article>
              </li>
            );
          })}
          {batches.length === 0 && !isLoading ? (
            <li className="py-6 text-sm text-slate-500">
              No payouts are scheduled yet. Eligible donations will appear here once batched.
            </li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}

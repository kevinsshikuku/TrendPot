"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@trendpot/ui";
import type { DonationHistoryEntry } from "@trendpot/types";
import { formatCurrencyFromCents } from "../../lib/money";

type DonationHistoryLayout = "auto" | "mobile" | "desktop";

const statusAccent: Record<DonationHistoryEntry["status"], string> = {
  pending: "text-amber-300",
  processing: "text-sky-300",
  succeeded: "text-emerald-300",
  failed: "text-rose-300"
};

const statusLabel: Record<DonationHistoryEntry["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  succeeded: "Paid",
  failed: "Failed"
};

export interface DonationHistoryProps {
  donations: DonationHistoryEntry[];
  fallbackCurrency: string;
  layout?: DonationHistoryLayout;
}

export function DonationHistory({ donations, fallbackCurrency, layout = "auto" }: DonationHistoryProps) {
  const layoutClassName = useMemo(() => {
    if (layout === "mobile") {
      return "flex flex-col gap-4";
    }
    if (layout === "desktop") {
      return "grid grid-cols-2 gap-4";
    }
    return "grid grid-cols-1 gap-4 lg:grid-cols-2";
  }, [layout]);

  return (
    <Card data-testid="donation-history" className="h-full">
      <CardHeader className="flex flex-col gap-2">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">Your donations</p>
          <h2 className="text-2xl font-semibold text-slate-100">Recent activity</h2>
        </div>
        <p className="text-sm text-slate-300">
          Track your support across challenges. Successful donations include receipts and quick share links.
        </p>
      </CardHeader>
      <CardContent className={layoutClassName}>
        {donations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-sm text-slate-400">
            You haven’t supported any challenges yet. Once you complete a donation, your receipts will appear here.
          </div>
        ) : (
          donations.map((donation) => {
            const amount = formatCurrencyFromCents(donation.amountCents, donation.currency ?? fallbackCurrency);
            return (
              <article
                key={donation.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
                data-testid="donation-history-entry"
              >
                <header className="flex flex-col gap-1">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{donation.challengeTitle}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-semibold text-slate-100">{amount}</span>
                    <span className={`text-xs font-semibold ${statusAccent[donation.status]}`}>
                      {statusLabel[donation.status]}
                    </span>
                  </div>
                </header>
                <div className="space-y-1 text-xs text-slate-400">
                  {donation.submissionTitle ? <p>{donation.submissionTitle}</p> : null}
                  <p>Receipt: {donation.mpesaReceipt ?? "—"}</p>
                  <p>Updated {new Date(donation.updatedAt).toLocaleString()}</p>
                </div>
                {donation.challengeShareUrl ? (
                  <a
                    href={donation.challengeShareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-emerald-300 hover:text-emerald-200"
                    data-testid="donation-history-share"
                  >
                    View challenge →
                  </a>
                ) : null}
              </article>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { Card, CardContent, CardHeader } from "@trendpot/ui";
import type { CreatorDonationConnection } from "@trendpot/types";
import { formatCurrencyFromCents } from "@/lib/money";

interface CreatorEarningsSummaryProps {
  connection: CreatorDonationConnection | undefined;
  isLoading: boolean;
  error?: string | null;
}

const formatDateLabel = (isoDate: string) => {
  try {
    return new Date(isoDate).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
  } catch (error) {
    return isoDate;
  }
};

export function CreatorEarningsSummary({ connection, isLoading, error }: CreatorEarningsSummaryProps) {
  const currency = connection?.edges[0]?.node.currency ?? "KES";
  const stats = connection?.stats;
  const trend = connection?.trend ?? [];

  return (
    <Card className="flex flex-col overflow-hidden" aria-busy={isLoading} aria-live="polite">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-100">Earnings overview</h2>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            Last {trend.length || 0} days
          </span>
        </div>
        <p className="text-sm text-slate-400">
          Track how donations are converting into upcoming payouts. Values are shown in {currency}.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {error ? (
          <p role="alert" className="rounded-xl bg-rose-900/30 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        ) : null}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/30 px-4 py-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Lifetime earnings</dt>
            <dd className="mt-2 text-2xl font-semibold text-slate-100">
              {stats ? formatCurrencyFromCents(stats.lifetimeAmountCents, currency) : "—"}
            </dd>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/30 px-4 py-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Pending capture</dt>
            <dd className="mt-2 text-2xl font-semibold text-slate-100">
              {stats ? formatCurrencyFromCents(stats.pendingAmountCents, currency) : "—"}
            </dd>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/30 px-4 py-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Available to schedule</dt>
            <dd className="mt-2 text-2xl font-semibold text-slate-100">
              {stats ? formatCurrencyFromCents(stats.availableAmountCents, currency) : "—"}
            </dd>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/30 px-4 py-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Supporters</dt>
            <dd className="mt-2 text-2xl font-semibold text-slate-100">
              {stats ? stats.lifetimeDonationCount.toLocaleString() : "—"}
            </dd>
          </div>
        </dl>
        <section aria-label="Earnings trend" className="space-y-3">
          <header className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-200">Past activity</h3>
            <span className="text-xs text-slate-500">Daily totals</span>
          </header>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {trend.map((point) => (
              <li
                key={point.date}
                className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-200"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{formatDateLabel(point.date)}</span>
                  <span className="text-xs text-slate-500">
                    {formatCurrencyFromCents(point.amountCents, currency)}
                  </span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-800">
                  <span
                    className="block h-2 rounded-full bg-emerald-400"
                    style={{
                      width: `${Math.min(100, point.amountCents / Math.max(1, stats?.availableAmountCents ?? 1) * 100)}%`
                    }}
                    role="presentation"
                    aria-hidden="true"
                  />
                </div>
              </li>
            ))}
            {trend.length === 0 && !isLoading ? (
              <li className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 px-4 py-6 text-center text-sm text-slate-500">
                No donations recorded yet. Promote your challenge to start receiving support.
              </li>
            ) : null}
          </ol>
        </section>
      </CardContent>
    </Card>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  AdminDonationConnection,
  AdminDonationMetrics,
  DonationPayoutState,
  DonationStatus
} from "@trendpot/types";
import { Button, Card, CardContent, CardHeader, Input, Label } from "@trendpot/ui";
import {
  adminDonationMetricsQueryOptions,
  adminDonationsQueryOptions
} from "@/lib/admin-donation-queries";
import { formatCurrencyFromCents } from "@/lib/money";
import {
  type AdminFilterState,
  buildFilterInput,
  defaultFilterState,
  donationStatusOptions,
  payoutStateOptions,
  countActiveFilters
} from "./admin-filter";
import { TrendChart } from "./trend-chart";

interface AdminFinanceDashboardProps {
  initialConnection?: AdminDonationConnection;
  initialMetrics?: AdminDonationMetrics;
}

const DEFAULT_PAGE_SIZE = 50;

export function AdminFinanceDashboard({
  initialConnection,
  initialMetrics
}: AdminFinanceDashboardProps) {
  const [filters, setFilters] = useState<AdminFilterState>(defaultFilterState);
  const filterInput = useMemo(() => buildFilterInput(filters), [filters]);

  const donationOptions = useMemo(
    () => adminDonationsQueryOptions({ first: DEFAULT_PAGE_SIZE, filter: filterInput }),
    [filterInput]
  );
  const metricsOptions = useMemo(
    () => adminDonationMetricsQueryOptions(filterInput),
    [filterInput]
  );

  const donationsQuery = useQuery({ ...donationOptions, initialData: initialConnection });
  const metricsQuery = useQuery({ ...metricsOptions, initialData: initialMetrics });

  const connection = donationsQuery.data;
  const metrics = metricsQuery.data;
  const totals = connection?.totals;
  const edges = connection?.edges ?? [];
  const currency = edges[0]?.node.currency ?? "KES";
  const activeFiltersCount = countActiveFilters(filters);

  const payoutPipeline = useMemo(() => {
    return edges.reduce<Record<string, { count: number; amountCents: number }>>((accumulator, { node }) => {
      const current = accumulator[node.payoutState] ?? { count: 0, amountCents: 0 };
      current.count += 1;
      current.amountCents += node.creatorShareCents;
      accumulator[node.payoutState] = current;
      return accumulator;
    }, {});
  }, [edges]);

  const statusBreakdown = useMemo(() => {
    return edges.reduce<Record<string, { count: number; amountCents: number }>>((accumulator, { node }) => {
      const current = accumulator[node.status] ?? { count: 0, amountCents: 0 };
      current.count += 1;
      current.amountCents += node.amountCents;
      accumulator[node.status] = current;
      return accumulator;
    }, {});
  }, [edges]);

  const handleToggleStatus = (status: DonationStatus) => {
    setFilters((current) => {
      const exists = current.statuses.includes(status);
      const nextStatuses = exists
        ? current.statuses.filter((item) => item !== status)
        : [...current.statuses, status];
      return { ...current, statuses: nextStatuses.sort() };
    });
  };

  const handleTogglePayoutState = (state: DonationPayoutState) => {
    setFilters((current) => {
      const exists = current.payoutStates.includes(state);
      const nextStates = exists
        ? current.payoutStates.filter((item) => item !== state)
        : [...current.payoutStates, state];
      return { ...current, payoutStates: nextStates.sort() };
    });
  };

  const handleResetFilters = () => {
    setFilters(defaultFilterState);
  };

  const exportFinanceCsv = () => {
    if (!metrics || !totals) {
      throw new Error("Metrics have not finished loading yet.");
    }

    const lines: string[] = [];
    const summaryHeaders = ["metric", "amount_cents", "formatted"];
    const summaryRows = [
      ["gross", totals.grossAmountCents, formatCurrencyFromCents(totals.grossAmountCents, currency)],
      ["creator_share", totals.creatorShareCents, formatCurrencyFromCents(totals.creatorShareCents, currency)],
      ["platform_share", totals.platformShareCents, formatCurrencyFromCents(totals.platformShareCents, currency)],
      ["platform_fee", totals.platformFeeCents, formatCurrencyFromCents(totals.platformFeeCents, currency)],
      ["platform_vat", totals.platformVatCents, formatCurrencyFromCents(totals.platformVatCents, currency)],
      ["pending_payouts", metrics.pendingPayoutCents, formatCurrencyFromCents(metrics.pendingPayoutCents, currency)],
      [
        "outstanding_clearing",
        metrics.outstandingClearingBalanceCents,
        formatCurrencyFromCents(Math.abs(metrics.outstandingClearingBalanceCents), currency)
      ]
    ];

    lines.push(summaryHeaders.join(","));
    for (const row of summaryRows) {
      lines.push(row.join(","));
    }

    const appendBucketSection = (title: string, buckets: typeof metrics.dailyTotals) => {
      lines.push("", `${title}_buckets,start,end,amount_cents,formatted`);
      for (const bucket of buckets) {
        lines.push(
          [
            title,
            bucket.start,
            bucket.end,
            bucket.amountCents,
            formatCurrencyFromCents(bucket.amountCents, currency)
          ].join(",")
        );
      }
    };

    appendBucketSection("daily", metrics.dailyTotals);
    appendBucketSection("weekly", metrics.weeklyTotals);
    appendBucketSection("monthly", metrics.monthlyTotals);

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `finance-${new Date().toISOString()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const renderAmount = (amount: number) => formatCurrencyFromCents(amount, currency);

  return (
    <section className="space-y-10" aria-label="Finance overview dashboard">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Financial summary</h2>
            <p className="text-sm text-slate-400">
              End-to-end breakdown of donation inflows, liabilities, and platform revenue for the selected slice.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={exportFinanceCsv} disabled={!metrics || !totals}>
              Export CSV
            </Button>
            {activeFiltersCount > 0 ? (
              <Button variant="secondary" onClick={handleResetFilters}>
                Reset filters
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <SummaryTile label="Gross donations" value={totals ? renderAmount(totals.grossAmountCents) : "—"} />
            <SummaryTile label="Creator share" value={totals ? renderAmount(totals.creatorShareCents) : "—"} accent="emerald" />
            <SummaryTile label="Platform commission" value={totals ? renderAmount(totals.platformShareCents) : "—"} accent="sky" />
            <SummaryTile label="Commission fee" value={totals ? renderAmount(totals.platformFeeCents) : "—"} accent="cyan" />
            <SummaryTile label="VAT collected" value={metrics ? renderAmount(metrics.vatCollectedCents) : "—"} accent="amber" />
            <SummaryTile label="Pending payouts" value={metrics ? renderAmount(metrics.pendingPayoutCents) : "—"} accent="emerald" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">Filter controls</h2>
          <p className="text-sm text-slate-400">Use filters to focus on a specific creator, challenge, or payout cohort.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <fieldset className="space-y-3">
              <legend className="text-xs uppercase tracking-wide text-slate-500">Donation status</legend>
              <div className="flex flex-wrap gap-2">
                {donationStatusOptions.map((status) => {
                  const checked = filters.statuses.includes(status);
                  return (
                    <button
                      type="button"
                      key={status}
                      onClick={() => handleToggleStatus(status)}
                      className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide transition ${
                        checked ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/60" : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="text-xs uppercase tracking-wide text-slate-500">Payout state</legend>
              <div className="flex flex-wrap gap-2">
                {payoutStateOptions.map((state) => {
                  const checked = filters.payoutStates.includes(state);
                  return (
                    <button
                      type="button"
                      key={state}
                      onClick={() => handleTogglePayoutState(state)}
                      className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide transition ${
                        checked ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/60" : "bg-slate-800 text-slate-300"
                      }`}
                    >
                      {state}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="financeChallengeId">Challenge ID</Label>
                <Input
                  id="financeChallengeId"
                  placeholder="ch_..."
                  value={filters.challengeId}
                  onChange={(event) => setFilters((current) => ({ ...current, challengeId: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="financeCreatorId">Creator ID</Label>
                <Input
                  id="financeCreatorId"
                  placeholder="usr_..."
                  value={filters.creatorUserId}
                  onChange={(event) => setFilters((current) => ({ ...current, creatorUserId: event.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="financeDonatedAfter">Donated after</Label>
              <Input
                id="financeDonatedAfter"
                type="date"
                value={filters.donatedAfter ?? ""}
                onChange={(event) => setFilters((current) => ({ ...current, donatedAfter: event.target.value || null }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="financeDonatedBefore">Donated before</Label>
              <Input
                id="financeDonatedBefore"
                type="date"
                value={filters.donatedBefore ?? ""}
                onChange={(event) => setFilters((current) => ({ ...current, donatedBefore: event.target.value || null }))}
              />
            </div>
            <div className="space-y-1 text-sm text-slate-400">
              <p>Filters apply immediately. Refine by any combination to isolate reporting windows.</p>
              {activeFiltersCount > 0 ? (
                <p>
                  <strong>{activeFiltersCount}</strong> active filter{activeFiltersCount === 1 ? "" : "s"}.
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">Trend analysis</h2>
          <p className="text-sm text-slate-400">Track inflows and liabilities over time to spot anomalies or growth periods.</p>
        </CardHeader>
        <CardContent>
          {metrics ? (
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <div className="space-y-6">
                <TrendChart title="Daily totals" buckets={metrics.dailyTotals} currency={currency} />
                <TrendChart title="Monthly totals" buckets={metrics.monthlyTotals} currency={currency} />
              </div>
              <aside className="space-y-4 text-sm text-slate-300">
                <p>
                  Clearing balance: <strong>{metrics ? renderAmount(Math.abs(metrics.outstandingClearingBalanceCents)) : "—"}</strong>
                </p>
                <p>
                  VAT accrued: <strong>{metrics ? renderAmount(metrics.vatCollectedCents) : "—"}</strong>
                </p>
                <p>
                  Pending payouts: <strong>{metrics ? renderAmount(metrics.pendingPayoutCents) : "—"}</strong>
                </p>
              </aside>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Metrics will appear once donations have been received.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold text-white">Payout pipeline</h3>
            <p className="text-sm text-slate-400">Snapshot of creator liabilities grouped by payout state.</p>
          </CardHeader>
          <CardContent>
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left">State</th>
                  <th scope="col" className="px-4 py-2 text-right">Donations</th>
                  <th scope="col" className="px-4 py-2 text-right">Creator share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60 text-slate-200">
                {Object.keys(payoutPipeline).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                      No donations available for payout analysis yet.
                    </td>
                  </tr>
                ) : (
                  Object.entries(payoutPipeline).map(([state, info]) => (
                    <tr key={state}>
                      <td className="px-4 py-3 capitalize">{state}</td>
                      <td className="px-4 py-3 text-right font-mono">{info.count}</td>
                      <td className="px-4 py-3 text-right">{renderAmount(info.amountCents)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold text-white">Donation status breakdown</h3>
            <p className="text-sm text-slate-400">Gross amounts grouped by webhook status for reconciliation.</p>
          </CardHeader>
          <CardContent>
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left">Status</th>
                  <th scope="col" className="px-4 py-2 text-right">Count</th>
                  <th scope="col" className="px-4 py-2 text-right">Gross</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60 text-slate-200">
                {Object.keys(statusBreakdown).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                      No donations recorded for the current filters.
                    </td>
                  </tr>
                ) : (
                  Object.entries(statusBreakdown).map(([status, info]) => (
                    <tr key={status}>
                      <td className="px-4 py-3 capitalize">{status}</td>
                      <td className="px-4 py-3 text-right font-mono">{info.count}</td>
                      <td className="px-4 py-3 text-right">{renderAmount(info.amountCents)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

interface SummaryTileProps {
  label: string;
  value: string;
  accent?: "emerald" | "sky" | "amber" | "cyan";
}

const SummaryTile = ({ label, value, accent = "emerald" }: SummaryTileProps) => {
  const accentStyles: Record<NonNullable<SummaryTileProps["accent"]>, string> = {
    emerald: "text-emerald-300",
    sky: "text-sky-300",
    amber: "text-amber-300",
    cyan: "text-cyan-300"
  };

  return (
    <dl className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-2 text-2xl font-semibold ${accentStyles[accent]}`}>{value}</dd>
    </dl>
  );
};

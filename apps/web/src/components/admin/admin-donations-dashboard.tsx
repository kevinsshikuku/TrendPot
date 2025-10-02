"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminDonationConnection,
  AdminDonationMetrics,
  DonationPayoutState,
  DonationStatus
} from "@trendpot/types";
import { Button, Card, CardContent, CardHeader, CardFooter, Input, Label } from "@trendpot/ui";
import {
  adminDonationMetricsQueryOptions,
  adminDonationsQueryOptions,
  fetchAdminDonationMetrics,
  fetchAdminDonations
} from "@/lib/admin-donation-queries";
import { formatCurrencyFromCents } from "@/lib/money";
import { TrendChart } from "./trend-chart";
import {
  type AdminFilterState,
  buildFilterInput,
  defaultFilterState,
  donationStatusOptions,
  payoutStateOptions,
  countActiveFilters
} from "./admin-filter";

const DEFAULT_PAGE_SIZE = 25;

interface AdminDonationsDashboardProps {
  initialConnection?: AdminDonationConnection;
  initialMetrics?: AdminDonationMetrics;
}

const encodeCsvValue = (value: unknown) => {
  if (value === null || typeof value === "undefined") {
    return "";
  }

  const stringValue = String(value);
  if (stringValue.includes(",") || stringValue.includes("\"") || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

const exportDonationsToCsv = (connection: AdminDonationConnection) => {
  const header = [
    "donation_id",
    "donated_at",
    "status",
    "payout_state",
    "gross_amount",
    "creator_share",
    "platform_share",
    "platform_fee",
    "platform_vat",
    "currency",
    "challenge_id",
    "submission_id",
    "creator_user_id",
    "donor_user_id",
    "donor_display_name",
    "ledger_journal_id",
    "mpesa_checkout_request_id",
    "mpesa_merchant_request_id",
    "payout_batch_id",
    "payout_item_id"
  ];

  const rows = connection.edges.map(({ node }) => [
    node.id,
    node.createdAt,
    node.status,
    node.payoutState,
    node.amountCents,
    node.creatorShareCents,
    node.platformShareCents,
    node.platformFeeCents,
    node.platformVatCents,
    node.currency,
    node.challengeId,
    node.submissionId,
    node.creatorUserId,
    node.donorUserId,
    node.donorDisplayName ?? "",
    node.ledgerJournalEntryId ?? "",
    node.mpesaCheckoutRequestId ?? "",
    node.mpesaMerchantRequestId ?? "",
    node.payoutBatchId ?? "",
    node.payoutItemId ?? ""
  ]);

  const csv = [
    header.map(encodeCsvValue).join(","),
    ...rows.map((row) => row.map(encodeCsvValue).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `donations-${new Date().toISOString()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export function AdminDonationsDashboard({
  initialConnection,
  initialMetrics
}: AdminDonationsDashboardProps) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<AdminFilterState>(defaultFilterState);
  const [isExporting, setIsExporting] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

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

  const exportMutation = useMutation({
    mutationFn: async () => {
      const connection = queryClient.getQueryData<AdminDonationConnection>(donationOptions.queryKey);
      if (!connection) {
        throw new Error("No donation data to export yet. Try again after the table loads.");
      }

      exportDonationsToCsv(connection);
    }
  });

  const connection = donationsQuery.data;
  const metrics = metricsQuery.data;
  const totals = connection?.totals;
  const donations = connection?.edges ?? [];
  const currency = donations[0]?.node.currency ?? "KES";
  const activeFiltersCount = countActiveFilters(filters);

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

  const handleLoadMore = async () => {
    const current = queryClient.getQueryData<AdminDonationConnection>(donationOptions.queryKey);

    if (!current?.pageInfo.hasNextPage || !current.pageInfo.endCursor) {
      return;
    }

    setIsFetchingMore(true);

    try {
      const next = await fetchAdminDonations({
        first: DEFAULT_PAGE_SIZE,
        after: current.pageInfo.endCursor,
        filter: filterInput
      });

      queryClient.setQueryData<AdminDonationConnection>(donationOptions.queryKey, (existing) => {
        if (!existing) {
          return next;
        }

        return {
          ...next,
          edges: [...existing.edges, ...next.edges],
          totals: next.totals,
          pageInfo: next.pageInfo
        };
      });
    } finally {
      setIsFetchingMore(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportMutation.mutateAsync();
    } finally {
      setIsExporting(false);
    }
  };

  const renderAmount = (amount: number) => formatCurrencyFromCents(amount, currency);

  return (
    <section className="space-y-10" aria-label="Donation oversight dashboard">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Totals</h2>
            <p className="text-sm text-slate-400">
              Aggregate view of donation performance with platform and creator splits.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleExport} disabled={isExporting || exportMutation.isPending}>
              {isExporting ? "Generating CSV…" : "Export CSV"}
            </Button>
            {activeFiltersCount > 0 ? (
              <Button variant="secondary" onClick={handleResetFilters}>
                Reset filters
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <dl className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Gross donations</dt>
              <dd className="mt-2 text-2xl font-semibold text-white">
                {totals ? renderAmount(totals.grossAmountCents) : "—"}
              </dd>
            </dl>
            <dl className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Creator share</dt>
              <dd className="mt-2 text-2xl font-semibold text-emerald-300">
                {totals ? renderAmount(totals.creatorShareCents) : "—"}
              </dd>
            </dl>
            <dl className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Platform commission</dt>
              <dd className="mt-2 text-2xl font-semibold text-sky-300">
                {totals ? renderAmount(totals.platformShareCents) : "—"}
              </dd>
            </dl>
            <dl className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4">
              <dt className="text-xs uppercase tracking-wide text-slate-500">VAT on commission</dt>
              <dd className="mt-2 text-2xl font-semibold text-amber-300">
                {totals ? renderAmount(totals.platformVatCents) : "—"}
              </dd>
            </dl>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
          <span>
            Showing <strong>{donations.length}</strong> donations of {totals?.count ?? "—"} total records.
          </span>
          <div className="flex flex-col gap-1 text-right md:text-left">
            {metrics ? (
              <span>
                Pending payouts: <strong>{renderAmount(metrics.pendingPayoutCents)}</strong> · Clearing balance: {" "}
                <strong>{renderAmount(Math.abs(metrics.outstandingClearingBalanceCents))}</strong>
              </span>
            ) : null}
            {exportMutation.isError ? (
              <span className="text-xs text-rose-300">
                Failed to export CSV: {(exportMutation.error as Error).message}
              </span>
            ) : null}
          </div>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">Filters</h2>
          <p className="text-sm text-slate-400">Combine status, payout state, and time windows to isolate cohorts.</p>
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
                <Label htmlFor="challengeId">Challenge ID</Label>
                <Input
                  id="challengeId"
                  placeholder="ch_..."
                  value={filters.challengeId}
                  onChange={(event) => setFilters((current) => ({ ...current, challengeId: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="creatorId">Creator ID</Label>
                <Input
                  id="creatorId"
                  placeholder="usr_..."
                  value={filters.creatorUserId}
                  onChange={(event) => setFilters((current) => ({ ...current, creatorUserId: event.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="donatedAfter">Donated after</Label>
              <Input
                id="donatedAfter"
                type="date"
                value={filters.donatedAfter ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, donatedAfter: event.target.value || null }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="donatedBefore">Donated before</Label>
              <Input
                id="donatedBefore"
                type="date"
                value={filters.donatedBefore ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, donatedBefore: event.target.value || null }))
                }
              />
            </div>
            <div className="space-y-2 text-sm text-slate-400">
              <p>Filters update instantly. Combine dimensions to narrow down reconciliation windows.</p>
              {activeFiltersCount > 0 ? (
                <p>
                  <strong>{activeFiltersCount}</strong> active filter{activeFiltersCount === 1 ? "" : "s"}.
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">Donation ledger</h2>
          <p className="text-sm text-slate-400">
            Detailed per-donation record with payout progression, ledger references, and M-Pesa metadata.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-slate-800 text-left" aria-live="polite">
            <thead className="bg-slate-950/60">
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-3">Donation</th>
                <th scope="col" className="px-4 py-3">Amounts</th>
                <th scope="col" className="px-4 py-3">Payout</th>
                <th scope="col" className="px-4 py-3">Ledger</th>
                <th scope="col" className="px-4 py-3">Timeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/70 text-sm text-slate-200">
              {donations.map(({ node }) => {
                const donatedAt = new Date(node.createdAt).toLocaleString();
                const availableAt = node.availableAt ? new Date(node.availableAt).toLocaleString() : "—";
                const paidAt = node.paidAt ? new Date(node.paidAt).toLocaleString() : "—";
                const lastStatus = node.statusHistory[node.statusHistory.length - 1];

                return (
                  <tr key={node.id} className="bg-slate-950/30">
                    <td className="px-4 py-4 align-top">
                      <div className="space-y-1">
                        <p className="font-semibold text-white">{node.donorDisplayName ?? "Anonymous"}</p>
                        <p className="text-xs text-slate-400">
                          Donation ID: <span className="font-mono text-slate-300">{node.id}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          Challenge: <span className="font-mono">{node.challengeId}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          Submission: <span className="font-mono">{node.submissionId}</span>
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="space-y-1">
                        <p>Gross: {renderAmount(node.amountCents)}</p>
                        <p>Creator: {renderAmount(node.creatorShareCents)}</p>
                        <p>Platform: {renderAmount(node.platformShareCents)}</p>
                        <p>VAT: {renderAmount(node.platformVatCents)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="space-y-1">
                        <p>Status: <span className="font-semibold uppercase">{node.status}</span></p>
                        <p>Payout: <span className="font-semibold uppercase">{node.payoutState}</span></p>
                        <p>Available: {availableAt}</p>
                        <p>Paid: {paidAt}</p>
                        {node.payoutBatchId ? (
                          <p className="text-xs text-slate-400">Batch: {node.payoutBatchId}</p>
                        ) : null}
                        {node.payoutItemId ? (
                          <p className="text-xs text-slate-400">Item: {node.payoutItemId}</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="space-y-1 text-xs text-slate-400">
                        <p>Ledger journal: {node.ledgerJournalEntryId ?? "—"}</p>
                        <p>Checkout: {node.mpesaCheckoutRequestId ?? "—"}</p>
                        <p>Merchant: {node.mpesaMerchantRequestId ?? "—"}</p>
                        <p>Account ref: {node.accountReference ?? "—"}</p>
                        <p>Failure: {node.failureReason ?? "—"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="space-y-2 text-xs text-slate-400">
                        <p>Donated: {donatedAt}</p>
                        {lastStatus ? (
                          <p>
                            Last update: {new Date(lastStatus.occurredAt).toLocaleString()} — {lastStatus.status}
                            {lastStatus.description ? ` · ${lastStatus.description}` : ""}
                          </p>
                        ) : null}
                        <p>Updated: {new Date(node.updatedAt).toLocaleString()}</p>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {donations.length === 0 && !donationsQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No donations match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-slate-400">
            {donationsQuery.isError
              ? `Failed to load donations: ${(donationsQuery.error as Error).message}`
              : donationsQuery.isFetching
              ? "Refreshing data…"
              : "Live data refreshed every 30 seconds."}
          </p>
          {connection?.pageInfo.hasNextPage ? (
            <Button onClick={handleLoadMore} disabled={isFetchingMore}>
              {isFetchingMore ? "Loading more…" : "Load more"}
            </Button>
          ) : null}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-white">Time-series metrics</h2>
          <p className="text-sm text-slate-400">
            Rolling aggregates help spot donation spikes, campaign slowdowns, and VAT accruals.
          </p>
        </CardHeader>
        <CardContent>
          {metrics ? (
            <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
              <div className="space-y-6">
                <TrendChart title="Daily totals" buckets={metrics.dailyTotals} currency={currency} />
                <TrendChart title="Weekly totals" buckets={metrics.weeklyTotals} currency={currency} />
              </div>
              <aside className="space-y-6">
                <dl className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">VAT collected</dt>
                  <dd className="mt-2 text-xl font-semibold text-amber-300">
                    {renderAmount(metrics.vatCollectedCents)}
                  </dd>
                </dl>
                <dl className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Pending payout balance</dt>
                  <dd className="mt-2 text-xl font-semibold text-emerald-300">
                    {renderAmount(metrics.pendingPayoutCents)}
                  </dd>
                </dl>
                <dl className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Outstanding clearing</dt>
                  <dd className="mt-2 text-xl font-semibold text-sky-300">
                    {renderAmount(Math.abs(metrics.outstandingClearingBalanceCents))}
                  </dd>
                </dl>
              </aside>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Metrics will appear after the first successful donation.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

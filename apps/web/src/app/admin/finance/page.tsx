import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import type { Metadata } from "next";
import { AdminFinanceDashboard } from "@/components/admin/admin-finance-dashboard";
import {
  adminDonationMetricsQueryOptions,
  adminDonationsQueryOptions
} from "@/lib/admin-donation-queries";
import { buildServerApiHeaders } from "@/lib/server-api-headers";

export const metadata: Metadata = {
  title: "Admin · Finance | TrendPot",
  description: "Summarise donation economics, VAT, and payout liabilities for finance operations."
};

export default async function AdminFinancePage() {
  const headers = buildServerApiHeaders();
  const queryClient = new QueryClient();

  const donationsOptions = adminDonationsQueryOptions(
    { first: 50 },
    { init: { headers } }
  );
  const metricsOptions = adminDonationMetricsQueryOptions(undefined, { init: { headers } });

  await Promise.all([
    queryClient.prefetchQuery(donationsOptions),
    queryClient.prefetchQuery(metricsOptions)
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <section className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-white">Finance oversight</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Analyse fundraising performance, reconcile ledger balances, and monitor liabilities before payout runs.
          </p>
        </header>
        <AdminFinanceDashboard />
      </section>
    </HydrationBoundary>
  );
}

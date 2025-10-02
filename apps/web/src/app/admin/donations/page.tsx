import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import type { Metadata } from "next";
import { AdminDonationsDashboard } from "@/components/admin/admin-donations-dashboard";
import {
  adminDonationMetricsQueryOptions,
  adminDonationsQueryOptions
} from "@/lib/admin-donation-queries";
import { buildServerApiHeaders } from "@/lib/server-api-headers";

export const metadata: Metadata = {
  title: "Admin · Donations | TrendPot",
  description: "Audit donations, review M-Pesa callbacks, and monitor payout readiness."
};

export default async function AdminDonationsPage() {
  const headers = buildServerApiHeaders();
  const queryClient = new QueryClient();

  const donationsOptions = adminDonationsQueryOptions(
    { first: 25 },
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
          <h1 className="text-3xl font-semibold text-white">Donation operations</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Review supporter activity, verify webhook outcomes, and validate the revenue split recorded in the ledger.
          </p>
        </header>
        <AdminDonationsDashboard />
      </section>
    </HydrationBoundary>
  );
}

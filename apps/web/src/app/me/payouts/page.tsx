import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CreatorPayoutDashboard } from "@/components/payouts/creator-payout-dashboard";
import { viewerQueryOptions } from "@/lib/auth-queries";
import {
  creatorDonationsQueryOptions,
  fetchCreatorDonations,
  payoutBatchesQueryOptions,
  fetchPayoutBatches,
  payoutNotificationsQueryOptions,
  fetchPayoutNotifications
} from "@/lib/payouts-queries";
import { loadViewerOnServer } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Payouts · TrendPot",
  description: "Monitor donation performance and upcoming creator payouts."
};

const buildServerHeaders = () => {
  const jar = cookies();
  const cookieHeader = jar
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");

  return {
    Cookie: cookieHeader,
    "x-requested-with": "nextjs"
  } as const;
};

export default async function CreatorPayoutsPage() {
  const viewer = await loadViewerOnServer();

  if (!viewer.user) {
    redirect("/login");
  }

  const roles = viewer.user.roles ?? [];
  const isCreator = roles.includes("creator") || roles.includes("admin") || roles.includes("operator");

  if (!isCreator) {
    redirect("/account?error=forbidden");
  }

  const headers = buildServerHeaders();
  const [donations, batches, notifications] = await Promise.all([
    fetchCreatorDonations({ first: 20 }, { init: { headers } }),
    fetchPayoutBatches({ first: 6 }, { init: { headers } }),
    fetchPayoutNotifications({ first: 10 }, { init: { headers } })
  ]);

  const queryClient = new QueryClient();
  queryClient.setQueryData(viewerQueryOptions().queryKey, viewer);

  const donationOptions = creatorDonationsQueryOptions({ first: 20 });
  const batchOptions = payoutBatchesQueryOptions({ first: 6 });
  const notificationOptions = payoutNotificationsQueryOptions({ first: 10 });

  queryClient.setQueryData(donationOptions.queryKey, donations);
  queryClient.setQueryData(batchOptions.queryKey, batches);
  queryClient.setQueryData(notificationOptions.queryKey, notifications);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <section className="flex flex-col gap-6 py-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-widest text-emerald-300">Creator hub</p>
          <h1 className="text-3xl font-semibold text-slate-100">Payouts</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Review donation performance, monitor scheduled disbursements, and keep tabs on payout notifications in one place.
          </p>
        </header>
        <CreatorPayoutDashboard
          initialDonations={donations}
          initialBatches={batches}
          initialNotifications={notifications}
        />
      </section>
    </HydrationBoundary>
  );
}

import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountDashboard } from "@/components/auth/account-dashboard";
import { viewerQueryOptions, viewerSessionsQueryOptions } from "@/lib/auth-queries";
import { loadViewerOnServer, loadViewerSessionsOnServer } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Account · TrendPot",
  description: "Manage your TrendPot profile, active sessions, and authentication preferences."
};

interface AccountPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const viewer = await loadViewerOnServer();

  if (!viewer.user) {
    redirect("/login");
  }

  const errorParam = typeof searchParams.error === "string" ? searchParams.error : null;
  const initialError = errorParam === "forbidden" ? "You do not have permission to manage that area." : null;

  const sessions = await loadViewerSessionsOnServer();
  const queryClient = new QueryClient();

  queryClient.setQueryData(viewerQueryOptions().queryKey, viewer);
  queryClient.setQueryData(viewerSessionsQueryOptions().queryKey, sessions);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <section className="flex flex-col gap-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold">Account security</h1>
          <p className="max-w-xl text-sm text-slate-400">
            Review your session history, keep tabs on which devices are connected, and sign out of anything unfamiliar.
          </p>
        </div>
        <AccountDashboard initialViewer={viewer} initialSessions={sessions} initialError={initialError ?? undefined} />
      </section>
    </HydrationBoundary>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@trendpot/ui";
import type { ChallengeListAnalytics, ChallengeSummary } from "@trendpot/types";
import { challengeAdminListQueryKey, fetchChallengeAdminList } from "../../lib/challenge-queries";
import { calculateCompletionPercentage, formatCurrencyFromCents } from "../../lib/money";

const PAGE_SIZE = 6;
const statusFilters = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "live", label: "Live" },
  { value: "archived", label: "Archived" }
];

export function ChallengesContent() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const listParams = useMemo(() => {
    return {
      first: PAGE_SIZE,
      filter: {
        status: statusFilter === "all" ? undefined : statusFilter,
        search: searchTerm.trim() || undefined
      }
    };
  }, [statusFilter, searchTerm]);

  const {
    data,
    isPending,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching
  } = useInfiniteQuery({
    queryKey: [...challengeAdminListQueryKey(listParams), "infinite"],
    queryFn: ({ pageParam }) => fetchChallengeAdminList({ ...listParams, after: pageParam }),
    getNextPageParam: (lastPage) => (lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.endCursor ?? undefined : undefined),
    initialPageParam: undefined
  });

  const analytics = data?.pages[0]?.analytics;
  const challenges = useMemo(
    () => data?.pages.flatMap((page) => page.edges.map((edge) => edge.node)) ?? [],
    [data]
  );
  const primaryCurrency = challenges[0]?.currency ?? "KES";

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold text-white">All challenges</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Browse every creator campaign, monitor progress, and jump into the stories powering TrendPot.
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
          href="/admin/challenges/new"
        >
          Create challenge
        </Link>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span className="font-medium">Search</span>
            <input
              className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              placeholder="Search by title or slug"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            <span className="font-medium">Status filter</span>
            <select
              className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {statusFilters.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <AnalyticsPanel analytics={analytics} isLoading={isPending} currency={primaryCurrency} />
      </div>

      {isPending && <ChallengeListSkeleton />}

      {isError && (
        <div className="rounded-3xl border border-red-500/40 bg-red-500/10 p-6">
          <h3 className="text-lg font-semibold text-red-200">We couldn&apos;t load challenges</h3>
          <p className="mt-1 text-sm text-red-200/80">{error instanceof Error ? error.message : "Unknown error"}</p>
          <Button className="mt-4" onClick={() => refetch()} disabled={isRefetching} variant="secondary">
            Try again
          </Button>
        </div>
      )}

      {!isPending && !isError && challenges.length === 0 && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center">
          <h3 className="text-lg font-semibold text-white">No campaigns yet</h3>
          <p className="mt-2 text-sm text-slate-300">
            Launch your first creator challenge to unlock insights, momentum tracking, and donation tooling.
          </p>
          <Link
            className="mt-4 inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
            href="/admin/challenges/new"
          >
            Create a challenge
          </Link>
        </div>
      )}

      {!isPending && !isError && challenges.length > 0 && (
        <div className="space-y-4">
          <div className="grid gap-4 md:hidden">
            {challenges.map((challenge) => (
              <article key={challenge.id} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
                <header className="space-y-1">
                  <p className="text-xs uppercase tracking-wider text-emerald-300">{challenge.status}</p>
                  <h3 className="text-xl font-semibold text-white">{challenge.title}</h3>
                  <p className="text-sm text-slate-300">{challenge.tagline}</p>
                </header>
                <div className="mt-4 space-y-2">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${calculateCompletionPercentage(challenge.raised, challenge.goal)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400">
                    Raised {formatCurrencyFromCents(challenge.raised, challenge.currency)} of {" "}
                    {formatCurrencyFromCents(challenge.goal, challenge.currency)} goal
                  </p>
                  <p className="text-xs text-slate-500">Updated {new Date(challenge.updatedAt).toLocaleString()}</p>
                </div>
                <Link
                  className="mt-4 inline-flex items-center text-sm font-medium text-emerald-400 hover:text-emerald-300"
                  href={`/c/${challenge.id}`}
                >
                  View insights
                </Link>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/60 md:block">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Challenge</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Raised</th>
                  <th className="px-4 py-3 font-medium">Goal</th>
                  <th className="px-4 py-3 font-medium">Last updated</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {challenges.map((challenge) => (
                  <tr key={challenge.id} className="text-slate-200">
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="font-medium text-white">{challenge.title}</p>
                        <p className="text-xs text-slate-400">{challenge.tagline}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-300">{challenge.status}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatCurrencyFromCents(challenge.raised, challenge.currency)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatCurrencyFromCents(challenge.goal, challenge.currency)}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{new Date(challenge.updatedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link className="text-emerald-400 hover:text-emerald-300" href={`/c/${challenge.id}`}>
                          View
                        </Link>
                        <Link className="text-slate-300 hover:text-white" href={`/admin/challenges/${challenge.id}/edit`}>
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasNextPage && (
            <div className="flex justify-center">
              <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} variant="secondary">
                {isFetchingNextPage ? "Loading more..." : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AnalyticsPanelProps {
  analytics: ChallengeListAnalytics | undefined;
  isLoading: boolean;
  currency: string;
}

function AnalyticsPanel({ analytics, isLoading, currency }: AnalyticsPanelProps) {
  const loading = isLoading || !analytics;

  return (
    <div className="grid gap-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-sm text-slate-200">
      <h3 className="text-sm font-semibold text-white">Listing insights</h3>
      <dl className="grid gap-3 sm:grid-cols-2">
        <AnalyticsStat label="Challenges" value={loading ? "--" : analytics.totalChallenges.toString()} />
        <AnalyticsStat
          label="Average completion"
          value={loading ? "--" : `${Math.round((analytics.averageCompletion ?? 0) * 100)}%`}
        />
        <AnalyticsStat
          label="Raised (page)"
          value={loading ? "--" : formatCurrencyFromCents(analytics.totalRaised, currency)}
        />
        <AnalyticsStat
          label="Goal (page)"
          value={loading ? "--" : formatCurrencyFromCents(analytics.totalGoal, currency)}
        />
      </dl>
      <div className="rounded-2xl bg-slate-900/60 p-3 text-xs text-slate-400">
        <p>
          Draft: {loading ? "--" : analytics.statusBreakdown.draft} • Live: {loading ? "--" : analytics.statusBreakdown.live} • Archived:
          {" "}
          {loading ? "--" : analytics.statusBreakdown.archived}
        </p>
      </div>
    </div>
  );
}

interface AnalyticsStatProps {
  label: string;
  value: string;
}

function AnalyticsStat({ label, value }: AnalyticsStatProps) {
  return (
    <div className="rounded-2xl bg-slate-900/60 p-3">
      <dt className="text-xs uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-white">{value}</dd>
    </div>
  );
}

function ChallengeListSkeleton() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:hidden">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="h-5 w-32 rounded bg-slate-800/80" />
            <div className="mt-3 h-4 w-full rounded bg-slate-800/70" />
            <div className="mt-6 h-2 w-full rounded bg-slate-800/70" />
            <div className="mt-3 h-3 w-2/3 rounded bg-slate-800/70" />
          </div>
        ))}
      </div>
      <div className="hidden animate-pulse overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60 md:block">
        <div className="h-12 border-b border-slate-800" />
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-12 border-b border-slate-800" />
        ))}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@trendpot/ui";
import { challengesQueryOptions } from "../../lib/challenge-queries";
import { calculateCompletionPercentage, formatCurrencyFromCents } from "../../lib/money";

export function ChallengesContent() {
  const { data, isPending, isError, error, refetch, isRefetching } = useQuery(challengesQueryOptions());
  const challenges = data ?? [];

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
        <div className="grid gap-6 md:grid-cols-2">
          {challenges.map((challenge) => (
            <article key={challenge.id} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
              <header className="space-y-1">
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
                  Raised {formatCurrencyFromCents(challenge.raised, challenge.currency)} of
                  {" "}
                  {formatCurrencyFromCents(challenge.goal, challenge.currency)} goal
                </p>
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
      )}
    </div>
  );
}

function ChallengeListSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="h-6 w-48 rounded bg-slate-800/80" />
          <div className="mt-3 h-4 w-full rounded bg-slate-800/70" />
          <div className="mt-6 h-2 w-full rounded bg-slate-800/70" />
          <div className="mt-3 h-3 w-2/3 rounded bg-slate-800/70" />
        </div>
      ))}
    </div>
  );
}

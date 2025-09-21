"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@trendpot/ui";
import type { ChallengeSummary } from "@trendpot/types";
import { FEATURED_CHALLENGE_LIMIT, featuredChallengesQueryOptions } from "../../lib/challenge-queries";

const currencyFormatter = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0
});

const formatAmount = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(amount);
  } catch (error) {
    return currencyFormatter.format(amount);
  }
};

const challengeSkeletons = Array.from({ length: FEATURED_CHALLENGE_LIMIT }, (_, index) => index);

export function HomeContent() {
  const { data, isPending, isError, error, refetch, isRefetching } = useQuery(featuredChallengesQueryOptions());
  const challenges = data ?? [];

  return (
    <div className="space-y-12">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl shadow-slate-950/40">
        <h2 className="text-2xl font-semibold text-white">Campaign Pulse</h2>
        <p className="mt-2 text-sm text-slate-300">
          Monitor performance signals from TikTok to understand which challenges are gaining traction across the community.
        </p>
        <dl className="mt-6 grid gap-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/80 p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Active Challenges</dt>
            <dd className="mt-2 text-3xl font-semibold text-white">12</dd>
          </div>
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/80 p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Creator Submissions</dt>
            <dd className="mt-2 text-3xl font-semibold text-white">384</dd>
          </div>
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/80 p-4">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Donations Processed</dt>
            <dd className="mt-2 text-3xl font-semibold text-white">KES 1.8M</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">Featured challenges</h2>
            <p className="text-sm text-slate-300">Preview a curated stream of creator-led campaigns.</p>
          </div>
          <Link className="text-sm font-medium text-emerald-400 hover:text-emerald-300" href="/challenges">
            View all
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-3xl border border-emerald-500/50 bg-emerald-500/10 p-6">
            <header className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold text-emerald-300">Launch your first campaign</h3>
              <p className="text-sm text-emerald-200/80">
                Kick off a creator challenge with automated storytelling prompts, metrics, and donation tooling.
              </p>
            </header>
            <Button className="mt-6 w-fit" variant="primary">
              Create challenge
            </Button>
          </article>
          {isPending &&
            challengeSkeletons.map((item) => (
              <article key={item} className="animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                <div className="h-6 w-40 rounded bg-slate-800/80" />
                <div className="mt-3 h-4 w-full rounded bg-slate-800/70" />
                <div className="mt-6 h-2 w-full rounded bg-slate-800/70" />
                <div className="mt-3 h-3 w-2/3 rounded bg-slate-800/70" />
              </article>
            ))}
          {isError && (
            <article className="rounded-3xl border border-red-500/40 bg-red-500/10 p-6">
              <header className="space-y-2">
                <h3 className="text-lg font-semibold text-red-200">We couldn&apos;t load featured challenges</h3>
                <p className="text-sm text-red-200/80">{error instanceof Error ? error.message : "Unknown error"}</p>
              </header>
              <Button className="mt-4" onClick={() => refetch()} disabled={isRefetching} variant="secondary">
                Try again
              </Button>
            </article>
          )}
          {!isPending && !isError &&
            challenges.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} />)}
        </div>
      </section>
    </div>
  );
}

function ChallengeCard({ challenge }: { challenge: ChallengeSummary }) {
  const completion = Math.min(100, Math.round((challenge.raised / challenge.goal) * 100));
  const raised = formatAmount(challenge.raised, challenge.currency);
  const goal = formatAmount(challenge.goal, challenge.currency);

  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
      <header>
        <h3 className="text-lg font-semibold text-white">{challenge.title}</h3>
        <p className="mt-1 text-sm text-slate-300">{challenge.tagline}</p>
      </header>
      <div className="mt-4 space-y-2">
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${completion}%` }} />
        </div>
        <p className="text-xs text-slate-400">
          Raised {raised} of {goal} goal
        </p>
      </div>
      <Link className="mt-4 inline-flex items-center text-sm font-medium text-emerald-400 hover:text-emerald-300" href={`/c/${challenge.id}`}>
        View insights
      </Link>
    </article>
  );
}

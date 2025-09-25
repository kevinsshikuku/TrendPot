"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@trendpot/ui";
import { challengeQueryOptions } from "../../lib/challenge-queries";
import { calculateCompletionPercentage, formatCurrencyFromCents } from "../../lib/money";

interface ChallengeDetailProps {
  challengeId: string;
}

export function ChallengeDetail({ challengeId }: ChallengeDetailProps) {
  const { data, isPending, isError, error, refetch, isRefetching } = useQuery(challengeQueryOptions(challengeId));

  if (isPending) {
    return <ChallengeDetailSkeleton />;
  }

  if (isError) {
    return (
      <div className="rounded-3xl border border-red-500/40 bg-red-500/10 p-8 text-center">
        <h2 className="text-xl font-semibold text-red-200">We couldn&apos;t load this challenge</h2>
        <p className="mt-2 text-sm text-red-200/80">{error instanceof Error ? error.message : "Unknown error"}</p>
        <Button className="mt-4" onClick={() => refetch()} disabled={isRefetching} variant="secondary">
          Try again
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center">
        <h2 className="text-xl font-semibold text-white">Challenge not found</h2>
        <p className="mt-2 text-sm text-slate-300">This challenge may have been archived or never existed.</p>
      </div>
    );
  }

  const completion = calculateCompletionPercentage(data.raised, data.goal);
  const raised = formatCurrencyFromCents(data.raised, data.currency);
  const goal = formatCurrencyFromCents(data.goal, data.currency);
  const statusLabel = data.status.charAt(0).toUpperCase() + data.status.slice(1);

  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-wide text-emerald-300">
          <span>Status</span>
          <span className="font-semibold">{statusLabel}</span>
        </div>
        <h1 className="text-4xl font-semibold text-white">{data.title}</h1>
        <p className="text-base text-slate-300">{data.tagline}</p>
      </header>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
        <h2 className="text-lg font-semibold text-white">Campaign performance</h2>
        <p className="mt-2 text-sm text-slate-300">Track how donations are pacing against your fundraising target.</p>
        <div className="mt-6 space-y-4">
          <div className="h-3 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${completion}%` }} />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
            <span className="font-semibold text-white">{raised}</span>
            <span>raised of {goal} goal</span>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 space-y-3">
        <h2 className="text-lg font-semibold text-white">Narrative</h2>
        <p className="text-sm text-slate-300 whitespace-pre-line">{data.description}</p>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-sm text-slate-300">
        <h2 className="text-lg font-semibold text-white">Operational metadata</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Currency</dt>
            <dd className="mt-1 text-base text-white">{data.currency}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Created</dt>
            <dd className="mt-1 text-base text-white">{new Date(data.createdAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Last updated</dt>
            <dd className="mt-1 text-base text-white">{new Date(data.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>
      </section>
    </article>
  );
}

function ChallengeDetailSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="h-6 w-32 rounded bg-slate-800/80" />
        <div className="h-10 w-3/4 rounded bg-slate-800/80" />
        <div className="h-4 w-2/3 rounded bg-slate-800/70" />
      </div>
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="h-5 w-40 rounded bg-slate-800/80" />
        <div className="mt-4 h-3 w-full rounded-full bg-slate-800/80" />
        <div className="mt-4 h-4 w-2/3 rounded bg-slate-800/70" />
      </div>
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="h-5 w-32 rounded bg-slate-800/80" />
        <div className="mt-3 h-16 w-full rounded bg-slate-800/70" />
      </div>
    </div>
  );
}

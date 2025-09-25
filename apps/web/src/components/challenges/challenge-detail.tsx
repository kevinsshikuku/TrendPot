"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@trendpot/ui";
import type { Submission } from "@trendpot/types";
import { challengeQueryOptions } from "../../lib/challenge-queries";
import { calculateCompletionPercentage, formatCurrencyFromCents } from "../../lib/money";
import { TikTokEmbed } from "./tiktok-embed";

const METRIC_FORMATTER = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
  useGrouping: false
});

const SUBMISSION_STATE_LABELS: Record<Submission["state"], string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  removed: "Removed"
};

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
  const submissions = data.submissions?.edges?.map((edge) => edge.node) ?? [];
  const heroSubmission = submissions[0];
  const secondarySubmissions = submissions.slice(1);

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

      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">TikTok submissions</h2>
          <p className="text-sm text-slate-300">
            Spotlighted creator videos refresh as metrics update so you can keep tabs on performance in near real time.
          </p>
        </div>

        {heroSubmission ? (
          <>
            <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6 lg:space-y-0">
              <div className="-mx-6 lg:mx-0">
                <div className="border-y border-slate-800 bg-slate-900/80 lg:overflow-hidden lg:rounded-3xl lg:border">
                  <TikTokEmbed embed={heroSubmission.video.embed} className="aspect-[9/16] overflow-hidden bg-black" />
                </div>
              </div>
              <aside className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs uppercase tracking-wide text-emerald-300">
                  <span>Featured</span>
                  <span className="font-semibold">{formatSubmissionState(heroSubmission.state)}</span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white">
                    {heroSubmission.video.caption?.trim() || "TikTok challenge spotlight"}
                  </h3>
                  <p className="text-sm text-slate-300">
                    Submitted {formatDateTime(heroSubmission.createdAt)} · Last refreshed {formatDateTime(heroSubmission.video.lastRefreshedAt)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
                  {renderMetric("Views", heroSubmission.video.metrics.viewCount)}
                  {renderMetric("Likes", heroSubmission.video.metrics.likeCount)}
                  {renderMetric("Comments", heroSubmission.video.metrics.commentCount)}
                  {renderMetric("Shares", heroSubmission.video.metrics.shareCount)}
                </div>
                {heroSubmission.rejectionReason ? (
                  <p className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {heroSubmission.rejectionReason}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <a
                    href={heroSubmission.video.shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
                  >
                    Watch on TikTok
                  </a>
                  {heroSubmission.video.embed.authorName ? (
                    <span className="text-xs uppercase tracking-wide text-slate-400">
                      Creator · {heroSubmission.video.embed.authorName}
                    </span>
                  ) : null}
                </div>
              </aside>
            </div>

            {secondarySubmissions.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2">
                {secondarySubmissions.map((submission) => (
                  <article key={submission.id} className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80">
                    <TikTokEmbed embed={submission.video.embed} className="aspect-[9/16] overflow-hidden bg-black" />
                    <div className="space-y-3 p-5 text-sm text-slate-300">
                      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                        <span>{formatSubmissionState(submission.state)}</span>
                        <span>{formatDateTime(submission.video.lastRefreshedAt)}</span>
                      </div>
                      <h3 className="text-base font-semibold text-white">
                        {submission.video.caption?.trim() || "TikTok submission"}
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {renderMetric("Views", submission.video.metrics.viewCount)}
                        {renderMetric("Likes", submission.video.metrics.likeCount)}
                        {renderMetric("Comments", submission.video.metrics.commentCount)}
                        {renderMetric("Shares", submission.video.metrics.shareCount)}
                      </div>
                      <a
                        href={submission.video.shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-full border border-slate-700 px-3 py-2 text-xs font-medium text-slate-100 transition hover:border-slate-500"
                      >
                        View on TikTok
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-sm text-slate-300">
            No TikTok submissions have been highlighted for this challenge yet. Check back soon as creators join in.
          </div>
        )}
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
            <dd className="mt-1 text-base text-white">{formatDateTime(data.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Last updated</dt>
            <dd className="mt-1 text-base text-white">{formatDateTime(data.updatedAt)}</dd>
          </div>
        </dl>
      </section>
    </article>
  );
}

function renderMetric(label: string, value: number) {
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{formatMetricValue(value)}</p>
    </div>
  );
}

function formatMetricValue(value: number): string {
  return METRIC_FORMATTER.format(value);
}

function formatSubmissionState(state: Submission["state"]): string {
  return SUBMISSION_STATE_LABELS[state] ?? state;
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
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
      <div className="space-y-4">
        <div className="h-5 w-48 rounded bg-slate-800/80" />
        <div className="h-4 w-3/4 rounded bg-slate-800/70" />
        <div className="h-[420px] w-full rounded-3xl bg-slate-900/60" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-64 rounded-3xl bg-slate-900/60" />
          <div className="h-64 rounded-3xl bg-slate-900/60" />
        </div>
      </div>
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="h-5 w-48 rounded bg-slate-800/80" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="h-16 rounded bg-slate-800/70" />
          <div className="h-16 rounded bg-slate-800/70" />
          <div className="h-16 rounded bg-slate-800/70" />
        </div>
      </div>
    </div>
  );
}

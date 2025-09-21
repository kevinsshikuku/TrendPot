import Link from "next/link";
import { Button } from "@trendpot/ui";

const demoChallenges = [
  {
    slug: "sunset-sprint",
    title: "Sunset Sprint",
    description: "Creators race to catch golden hour transitions in 30 seconds.",
    raised: 4200,
    goal: 10000
  },
  {
    slug: "duet-drive",
    title: "Duet Drive",
    description: "A weekly duet challenge supporting emerging Kenyan dancers.",
    raised: 1850,
    goal: 5000
  }
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl shadow-slate-950/40">
        <h2 className="text-2xl font-semibold text-white">Campaign Pulse</h2>
        <p className="mt-2 text-sm text-slate-300">
          Monitor performance signals from TikTok to understand which challenges are
          gaining traction across the community.
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
              <p className="text-sm text-emerald-200/80">Kick off a creator challenge with automated storytelling prompts, metrics, and donation tooling.</p>
            </header>
            <Button className="mt-6 w-fit" variant="primary">Create challenge</Button>
          </article>
          {demoChallenges.map((challenge) => {
            const completion = Math.min(100, Math.round((challenge.raised / challenge.goal) * 100));
            return (
              <article key={challenge.slug} className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
                <header>
                  <h3 className="text-lg font-semibold text-white">{challenge.title}</h3>
                  <p className="mt-1 text-sm text-slate-300">{challenge.description}</p>
                </header>
                <div className="mt-4 space-y-2">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${completion}%` }} />
                  </div>
                  <p className="text-xs text-slate-400">
                    Raised KES {challenge.raised.toLocaleString()} of KES {challenge.goal.toLocaleString()} goal
                  </p>
                </div>
                <Link
                  className="mt-4 inline-flex items-center text-sm font-medium text-emerald-400 hover:text-emerald-300"
                  href={`/c/${challenge.slug}`}
                >
                  View insights
                </Link>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

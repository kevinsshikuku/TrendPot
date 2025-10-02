import type { AdminDonationTimeBucket } from "@trendpot/types";
import { formatCurrencyFromCents } from "@/lib/money";

interface TrendChartProps {
  title: string;
  buckets: AdminDonationTimeBucket[];
  currency: string;
}

export function TrendChart({ title, buckets, currency }: TrendChartProps) {
  if (!buckets || buckets.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-6 text-sm text-slate-400">
        No data recorded for {title.toLowerCase()} yet.
      </div>
    );
  }

  const max = Math.max(...buckets.map((bucket) => bucket.amountCents));
  const min = Math.min(...buckets.map((bucket) => bucket.amountCents));
  const range = Math.max(1, max - min);
  const width = 520;
  const height = 160;
  const step = buckets.length > 1 ? width / (buckets.length - 1) : width;
  const gradientId = `trendGradient-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const path = buckets
    .map((bucket, index) => {
      const x = index * step;
      const normalized = (bucket.amountCents - min) / range;
      const y = height - normalized * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-950/40 p-6">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-xs text-slate-400">
          Peak: {formatCurrencyFromCents(max, currency)} · Floor: {formatCurrencyFromCents(min, currency)}
        </p>
      </header>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`${title} sparkline`}>
        <path d={`${path}`} fill="none" stroke={`url(#${gradientId})`} strokeWidth="3" strokeLinecap="round" />
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.8" />
          </linearGradient>
        </defs>
      </svg>
      <ul className="space-y-2 text-xs text-slate-400">
        {buckets.map((bucket) => (
          <li key={`${bucket.start}-${bucket.end}`} className="flex justify-between">
            <span>
              {new Date(bucket.start).toLocaleDateString()} → {new Date(bucket.end).toLocaleDateString()}
            </span>
            <span className="font-medium text-slate-200">
              {formatCurrencyFromCents(bucket.amountCents, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

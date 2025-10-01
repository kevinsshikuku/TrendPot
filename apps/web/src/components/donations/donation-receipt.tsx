"use client";

import { useMemo, useState } from "react";
import { Button, Card, CardContent, CardHeader } from "@trendpot/ui";
import type { Donation } from "@trendpot/types";
import { formatCurrencyFromCents } from "../../lib/money";

type DonationReceiptLayout = "auto" | "mobile" | "desktop";

const statusDescriptions: Record<Donation["status"], string> = {
  pending: "Awaiting your M-Pesa approval.",
  processing: "Payment received, finalizing receipt…",
  succeeded: "Donation paid successfully.",
  failed: "Donation failed. You can retry with the same idempotency key."
};

const statusLabels: Record<Donation["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  succeeded: "Paid",
  failed: "Failed"
};

const statusAccent: Record<Donation["status"], string> = {
  pending: "text-amber-300",
  processing: "text-sky-300",
  succeeded: "text-emerald-300",
  failed: "text-rose-300"
};

export interface DonationReceiptProps {
  donation: Donation | null;
  challengeTitle: string;
  fallbackCurrency: string;
  shareUrl?: string | null;
  layout?: DonationReceiptLayout;
  optimistic?: boolean;
}

const buildShareLink = (shareUrl: string | null | undefined, challengeTitle: string) => {
  if (!shareUrl) {
    return {
      whatsapp: null,
      twitter: null
    };
  }

  const message = encodeURIComponent(`I just supported ${challengeTitle}! Join me: ${shareUrl}`);
  return {
    whatsapp: `https://wa.me/?text=${message}`,
    twitter: `https://twitter.com/intent/tweet?text=${message}`
  };
};

export function DonationReceipt({
  donation,
  challengeTitle,
  fallbackCurrency,
  shareUrl,
  layout = "auto",
  optimistic = false
}: DonationReceiptProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const layoutClassName = useMemo(() => {
    if (layout === "mobile") {
      return "flex flex-col gap-6";
    }
    if (layout === "desktop") {
      return "grid grid-cols-2 gap-6";
    }
    return "grid grid-cols-1 gap-6 md:grid-cols-2";
  }, [layout]);

  const shareLinks = useMemo(() => buildShareLink(shareUrl, challengeTitle), [shareUrl, challengeTitle]);

  const status = donation?.status ?? (optimistic ? "pending" : "pending");
  const statusLabel = statusLabels[status];
  const statusDescription = optimistic
    ? "We’re sending your STK push. Approve it on your phone to complete the donation."
    : statusDescriptions[status];

  const amount = donation
    ? formatCurrencyFromCents(donation.amountCents, donation.currency)
    : formatCurrencyFromCents(0, fallbackCurrency);

  const copyLink = async () => {
    if (!shareUrl) {
      setCopyState("error");
      return;
    }

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setCopyState("copied");
        setTimeout(() => setCopyState("idle"), 2000);
      } else {
        throw new Error("Clipboard not supported");
      }
    } catch (error) {
      console.error("Failed to copy share link", error);
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 2500);
    }
  };

  const openShareLink = (url: string | null) => {
    if (!url) {
      return;
    }

    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Card data-testid="donation-receipt" className="h-full">
      <CardHeader className="flex flex-col gap-2">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">Donation receipt</p>
          <h2 className="text-2xl font-semibold text-slate-100">{challengeTitle}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${statusAccent[status]}`} data-testid="donation-status">
            {statusLabel}
          </span>
          <span className="text-sm text-slate-400">{amount}</span>
        </div>
        <p className="text-sm text-slate-300" data-testid="donation-status-description">
          {statusDescription}
        </p>
      </CardHeader>
      <CardContent className={`${layoutClassName} text-sm text-slate-300`}>
        <dl className="space-y-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Amount</dt>
            <dd className="text-base text-slate-100">{amount}</dd>
          </div>
          {donation?.mpesaReceipt ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">M-Pesa receipt</dt>
              <dd className="text-base font-mono text-slate-100" data-testid="mpesa-receipt">
                {donation.mpesaReceipt}
              </dd>
            </div>
          ) : null}
          {donation?.failureReason ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Failure reason</dt>
              <dd className="text-base text-rose-300" data-testid="failure-reason">
                {donation.failureReason}
              </dd>
            </div>
          ) : null}
          {donation?.idempotencyKey ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Idempotency key</dt>
              <dd className="text-base font-mono text-slate-100">{donation.idempotencyKey}</dd>
            </div>
          ) : null}
        </dl>
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Share the challenge</h3>
            <p className="mt-1 text-xs text-slate-400">
              Let others know about this challenge to keep the momentum going.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {shareLinks.whatsapp ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => openShareLink(shareLinks.whatsapp)}
                className="grow basis-full sm:basis-auto"
                data-testid="share-whatsapp"
              >
                Share on WhatsApp
              </Button>
            ) : null}
            {shareLinks.twitter ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => openShareLink(shareLinks.twitter)}
                className="grow basis-full sm:basis-auto"
                data-testid="share-twitter"
              >
                Share on X
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={copyLink}
              disabled={!shareUrl}
              className="grow basis-full sm:basis-auto"
              data-testid="share-copy"
            >
              {copyState === "copied" ? "Link copied" : copyState === "error" ? "Copy failed" : "Copy link"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

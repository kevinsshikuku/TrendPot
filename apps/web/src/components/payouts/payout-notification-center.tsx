"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, CardContent, CardHeader } from "@trendpot/ui";
import type { PayoutNotificationConnection } from "@trendpot/types";

interface PayoutNotificationCenterProps {
  connection: PayoutNotificationConnection | undefined;
  isLoading: boolean;
  onMarkAsRead?: (ids: string[]) => Promise<void> | void;
  isMutating?: boolean;
}

export function PayoutNotificationCenter({
  connection,
  isLoading,
  onMarkAsRead,
  isMutating,
}: PayoutNotificationCenterProps) {
  const edges = connection?.edges ?? [];
  const unreadIds = useMemo(
    () => edges.filter((edge) => !edge.node.readAt).map((edge) => edge.node.id),
    [edges]
  );
  const seenIds = useRef(new Set<string>());
  const [activeToasts, setActiveToasts] = useState<string[]>([]);

  useEffect(() => {
    const newUnread = edges.filter((edge) => !edge.node.readAt && !seenIds.current.has(edge.node.id));

    if (newUnread.length === 0) {
      return;
    }

    newUnread.forEach((edge) => {
      seenIds.current.add(edge.node.id);
      setActiveToasts((current) => Array.from(new Set([...current, edge.node.id])));
      setTimeout(() => {
        setActiveToasts((current) => current.filter((id) => id !== edge.node.id));
      }, 6000);
    });
  }, [edges]);

  const handleMarkAll = async () => {
    if (!onMarkAsRead || unreadIds.length === 0) {
      return;
    }

    await onMarkAsRead(unreadIds);
  };

  return (
    <Card aria-busy={isLoading} className="relative flex flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex flex-col gap-2" aria-live="assertive">
        {activeToasts.map((id) => {
          const notification = edges.find((edge) => edge.node.id === id)?.node;
          if (!notification) {
            return null;
          }

          return (
            <div
              key={id}
              className="pointer-events-auto rounded-2xl border border-emerald-500/40 bg-emerald-950/80 px-4 py-3 text-sm text-emerald-100 shadow-lg shadow-emerald-900/40"
              role="status"
            >
              <p className="font-medium">{notification.message}</p>
              <p className="text-xs text-emerald-300">{new Date(notification.eventAt).toLocaleString()}</p>
            </div>
          );
        })}
      </div>
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Payout alerts</h2>
            <p className="text-sm text-slate-400">Stay on top of payout lifecycle updates.</p>
          </div>
          <Button
            variant="secondary"
            disabled={!unreadIds.length || isMutating}
            onClick={handleMarkAll}
            aria-live="polite"
          >
            {isMutating ? "Marking…" : `Mark all read (${unreadIds.length})`}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4" aria-live="polite">
        {edges.length === 0 && !isLoading ? (
          <p className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 px-4 py-6 text-sm text-slate-500">
            You are all caught up. New payout updates will appear here and as toasts.
          </p>
        ) : null}
        <ul className="space-y-3">
          {edges.slice(0, 6).map(({ node }) => (
            <li key={node.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
              <article>
                <header className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-100">{node.message}</h3>
                  {node.readAt ? (
                    <span className="text-xs text-slate-500">Read</span>
                  ) : (
                    <span className="text-xs text-emerald-300">New</span>
                  )}
                </header>
                <p className="mt-2 text-xs text-slate-500">{new Date(node.eventAt).toLocaleString()}</p>
                {node.metadata ? (
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                    {node.metadata.amountCents ? (
                      <div>
                        <dt>Amount</dt>
                        <dd>
                          {Intl.NumberFormat("en-KE", {
                            style: "currency",
                            currency: node.metadata.currency ?? "KES",
                            maximumFractionDigits: 0
                          }).format((node.metadata.amountCents ?? 0) / 100)}
                        </dd>
                      </div>
                    ) : null}
                    {node.metadata.payoutBatchId ? (
                      <div>
                        <dt>Batch</dt>
                        <dd>{node.metadata.payoutBatchId}</dd>
                      </div>
                    ) : null}
                    {node.metadata.donationId ? (
                      <div>
                        <dt>Donation</dt>
                        <dd>{node.metadata.donationId}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

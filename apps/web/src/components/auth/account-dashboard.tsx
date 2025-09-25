"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardContent, CardFooter, CardHeader } from "@trendpot/ui";
import type { Viewer, ViewerSession } from "@trendpot/types";
import { logout, revokeSession } from "@/lib/auth-client";
import { viewerQueryOptions, viewerSessionsQueryOptions } from "@/lib/auth-queries";

interface SessionDrawerProps {
  session: ViewerSession | null;
  currentSessionId: string | null;
  isProcessing: boolean;
  onClose: () => void;
  onLogoutCurrent: () => void;
  onRevokeSession: (sessionId: string) => void;
}

function SessionDrawer({
  session,
  currentSessionId,
  isProcessing,
  onClose,
  onLogoutCurrent,
  onRevokeSession
}: SessionDrawerProps) {
  if (!session) {
    return null;
  }

  const isCurrent = currentSessionId === session.id;
  const subtitle = [session.metadata?.device ?? session.userAgent, session.ipAddress]
    .filter(Boolean)
    .join(" · ");
  const expiresLabel = new Date(session.expiresAt).toLocaleString();

  return (
    <div className="fixed inset-0 z-50 flex sm:hidden">
      <button
        type="button"
        aria-label="Close session details"
        className="absolute inset-0 bg-slate-950/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative mt-auto w-full rounded-t-3xl border border-slate-800 bg-slate-900 px-6 py-6 shadow-2xl shadow-black/50"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Session details</h2>
          <button type="button" className="text-sm text-slate-400" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="space-y-2 text-sm text-slate-300">
          <p className="font-medium text-slate-100">
            {isCurrent ? "This device" : session.metadata?.device ?? "Unknown device"}
          </p>
          <p className="text-xs text-slate-500">{subtitle || "No additional metadata"}</p>
          <p className="text-xs text-slate-500">Status {session.status}</p>
          <p className="text-xs text-slate-500">Expires {expiresLabel}</p>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            variant={isCurrent ? "secondary" : "primary"}
            className="w-full"
            onClick={() => (isCurrent ? onLogoutCurrent() : onRevokeSession(session.id))}
            disabled={isProcessing}
          >
            {isProcessing ? "Working..." : isCurrent ? "Sign out of this device" : "Revoke session"}
          </Button>
          <Button variant="secondary" className="w-full" onClick={onClose}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}

interface AccountDashboardProps {
  initialViewer: Viewer;
  initialSessions: ViewerSession[];
  initialError?: string;
}

export function AccountDashboard({
  initialViewer,
  initialSessions,
  initialError
}: AccountDashboardProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [drawerSession, setDrawerSession] = useState<ViewerSession | null>(null);

  useEffect(() => {
    setError(initialError ?? null);
  }, [initialError]);

  const viewerQuery = useQuery({ ...viewerQueryOptions(), initialData: initialViewer });
  const sessionsQuery = useQuery({ ...viewerSessionsQueryOptions(), initialData: initialSessions });

  const currentSessionId = viewerQuery.data?.session?.id ?? null;
  const sessions = sessionsQuery.data ?? [];

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async ({ viewer }) => {
      await queryClient.invalidateQueries({ queryKey: ["viewer"] });
      await queryClient.invalidateQueries({ queryKey: ["viewer", "sessions"] });
      setDrawerSession(null);
      if (!viewer.session) {
        window.location.href = "/";
      }
    },
    onError: (cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "We couldn't end the session. Try again.");
    }
  });

  const revokeMutation = useMutation({
    mutationFn: revokeSession,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["viewer", "sessions"] });
      setError(null);
      setDrawerSession(null);
    },
    onError: (cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "We couldn't revoke that session.");
    }
  });

  const isProcessing = logoutMutation.isPending || revokeMutation.isPending;

  const activeSessions = useMemo(
    () => sessions.slice().sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1)),
    [sessions]
  );

  const handleLogoutCurrent = () => {
    if (!currentSessionId) {
      return;
    }
    setError(null);
    logoutMutation.mutate(currentSessionId);
  };

  const handleRevoke = (sessionId: string) => {
    setError(null);
    revokeMutation.mutate(sessionId);
  };

  const overviewFooterClassName =
    "sticky bottom-0 left-0 right-0 flex flex-col gap-3 border-t border-slate-800 bg-slate-950/80 px-6 py-5 " +
    "backdrop-blur-md md:static md:flex-row md:items-center md:justify-between md:bg-transparent md:backdrop-blur-none";

  return (
    <>
      <div className="space-y-8">
        <Card className="relative flex flex-col overflow-hidden backdrop-blur">
          <CardHeader className="gap-2">
            <h2 className="text-xl font-semibold sm:text-2xl">Account overview</h2>
            <p className="text-sm text-slate-400 sm:text-base">
              Manage your identity, see active sessions, and keep your workspace secure.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Email</p>
              <p className="mt-1 text-base font-medium text-slate-100">{viewerQuery.data?.user?.email}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Display name</p>
              <p className="mt-1 text-base font-medium text-slate-100">{viewerQuery.data?.user?.displayName}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Roles</p>
              <p className="mt-1 text-base font-medium text-slate-100">
                {viewerQuery.data?.user?.roles.join(", ")}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
              <p className="mt-1 text-base font-medium text-emerald-400">
                {viewerQuery.data?.user?.status ?? "active"}
              </p>
            </div>
          </CardContent>
          <CardFooter className={overviewFooterClassName}>
            <Button
              variant="secondary"
              className="w-full md:w-auto"
              onClick={handleLogoutCurrent}
              disabled={logoutMutation.isPending || !currentSessionId}
            >
              {logoutMutation.isPending ? "Signing out..." : "Sign out of this device"}
            </Button>
            <p className="text-xs text-slate-500 sm:text-sm">
              We'll clear cookies and revoke refresh tokens so this device no longer has access.
            </p>
          </CardFooter>
        </Card>

        <Card className="relative flex flex-col overflow-hidden backdrop-blur">
          <CardHeader className="gap-2">
            <h3 className="text-lg font-semibold sm:text-xl">Active sessions</h3>
            <p className="text-sm text-slate-400 sm:text-base">
              Review and revoke devices that have access to your TrendPot account.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pb-6">
            {activeSessions.length === 0 ? (
              <p className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-400">
                No active sessions detected.
              </p>
            ) : (
              <ul className="space-y-3">
                {activeSessions.map((session) => {
                  const isCurrent = session.id === currentSessionId;
                  const subtitle = [session.metadata?.device ?? session.userAgent, session.ipAddress]
                    .filter(Boolean)
                    .join(" · ");
                  const expiresAt = new Date(session.expiresAt).toLocaleString();

                  return (
                    <li
                      key={session.id}
                      className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-100">
                            {isCurrent ? "This device" : session.metadata?.device ?? "Unknown device"}
                          </p>
                          <p className="hidden text-xs text-slate-500 sm:block">
                            {subtitle || "No additional metadata"}
                          </p>
                          <p className="hidden text-xs text-slate-600 sm:block">
                            Last active until {expiresAt} • Status {session.status}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                          <Button
                            variant={isCurrent ? "secondary" : "primary"}
                            className="hidden sm:inline-flex sm:w-auto"
                            onClick={() => (isCurrent ? handleLogoutCurrent() : handleRevoke(session.id))}
                            disabled={isProcessing}
                          >
                            {isCurrent
                              ? logoutMutation.isPending
                                ? "Signing out..."
                                : "Sign out"
                              : revokeMutation.isPending
                              ? "Revoking..."
                              : "Revoke"}
                          </Button>
                          <Button
                            variant="secondary"
                            className="sm:hidden"
                            onClick={() => setDrawerSession(session)}
                          >
                            View details
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-600 sm:hidden">
                        Last active until {expiresAt} • Status {session.status}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 sm:hidden">
                        {subtitle || "No additional metadata"}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {error ? (
              <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <SessionDrawer
        session={drawerSession}
        currentSessionId={currentSessionId}
        isProcessing={isProcessing}
        onClose={() => setDrawerSession(null)}
        onLogoutCurrent={handleLogoutCurrent}
        onRevokeSession={handleRevoke}
      />
    </>
  );
}

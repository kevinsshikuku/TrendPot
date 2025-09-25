"use client";

import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button, Card, CardContent, CardFooter, CardHeader } from "@trendpot/ui";
import { startTikTokLogin } from "@/lib/auth-client";
import { launchTikTokLogin } from "@/lib/tiktok-open-sdk";

function resolveDeviceLabel() {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const platform = navigator.platform || "web";
  const userAgent = navigator.userAgent || "browser";
  return `${platform} · ${userAgent.split(" ")[0]}`.slice(0, 80);
}

interface LoginFormProps {
  nextPath?: string;
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const deviceLabel = useMemo(() => resolveDeviceLabel(), []);

  const mutation = useMutation({
    mutationFn: async () => {
      setStatus("Contacting TikTok…");
      const { intent } = await startTikTokLogin({ returnPath: nextPath, deviceLabel });
      setStatus("Redirecting to TikTok…");
      await launchTikTokLogin(intent);
    },
    onSuccess: () => {
      setError(null);
    },
    onError: (cause: unknown) => {
      setStatus(null);
      if (cause instanceof Error) {
        setError(cause.message);
      } else {
        setError("We couldn't start the TikTok login flow. Please try again.");
      }
    }
  });

  const cardFooterClassName =
    "sticky bottom-0 left-0 right-0 flex flex-col gap-3 border-t border-slate-800 bg-slate-950/80 px-6 py-5 backdrop-blur-md " +
    "md:static md:bg-transparent md:backdrop-blur-none";

  return (
    <Card className="relative mx-auto flex w-full max-w-lg flex-col overflow-hidden backdrop-blur">
      <CardHeader className="gap-3">
        <h2 className="text-xl font-semibold sm:text-2xl">Welcome back</h2>
        <p className="text-sm text-slate-400 sm:text-base">
          Keep browsing as a guest or continue with TikTok when you want to join challenges, donate, or manage your sessions.
          We&apos;ll hand the login intent to TikTok&apos;s OpenSDK and redirect you back once they confirm.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
        ) : null}
        {status ? (
          <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            {status}
          </p>
        ) : (
          <p className="text-xs text-slate-500 sm:text-sm">
            You can keep exploring without logging in. When you need to take an action that requires an account, we&apos;ll prompt
            you to authenticate with TikTok.
          </p>
        )}
      </CardContent>
      <CardFooter className={cardFooterClassName}>
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Contacting TikTok…" : "Continue with TikTok"}
        </Button>
        <p className="text-xs text-slate-500 sm:text-sm">
          Need a TrendPot account? <a href="/signup" className="text-emerald-400 underline">Sign up with TikTok</a>.
        </p>
      </CardFooter>
    </Card>
  );
}

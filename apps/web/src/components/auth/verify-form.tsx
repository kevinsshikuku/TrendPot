"use client";

import { Card, CardContent, CardHeader } from "@trendpot/ui";

interface VerifyFormProps {
  email: string;
  token: string;
  expiresAt?: string;
  deliveryHint?: string;
  displayName?: string;
  intent?: string;
  nextPath?: string;
}

export function VerifyForm({ email, deliveryHint }: VerifyFormProps) {
  return (
    <Card className="relative mx-auto flex w-full max-w-lg flex-col overflow-hidden backdrop-blur">
      <CardHeader className="gap-3">
        <h2 className="text-xl font-semibold sm:text-2xl">TikTok login replaces email codes</h2>
        <p className="text-sm text-slate-400 sm:text-base">
          We no longer issue one-time passcodes to <span className="font-medium text-slate-200">{deliveryHint ?? email}</span>.
          Use the TikTok login entry point to authenticate instead. Once the OpenSDK completes, you'll be redirected back to the
          page you started from.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          Looking for your account? Head to the <a href="/login" className="underline">login</a> or
          <a href="/signup" className="underline"> signup</a> page and start the TikTok flow—no email code required.
        </p>
      </CardContent>
    </Card>
  );
}

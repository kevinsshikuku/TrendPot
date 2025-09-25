"use client";

import { useMemo, useState } from "react";
import { Button, Card, CardContent, CardFooter, CardHeader } from "@trendpot/ui";

interface VerifyFormProps {
  emailHint?: string;
  nextPath?: string;
}

function buildAuthUrl(basePath: "/login" | "/signup", nextPath?: string) {
  if (!nextPath) {
    return basePath;
  }

  const encodedNext = encodeURIComponent(nextPath);
  return `${basePath}?next=${encodedNext}`;
}

export function VerifyForm({ emailHint, nextPath }: VerifyFormProps) {
  const [isNavigating, setIsNavigating] = useState(false);
  const loginHref = useMemo(() => buildAuthUrl("/login", nextPath), [nextPath]);
  const signupHref = useMemo(() => buildAuthUrl("/signup", nextPath), [nextPath]);

  return (
    <Card className="relative mx-auto flex w-full max-w-lg flex-col overflow-hidden backdrop-blur">
      <CardHeader className="gap-3">
        <h2 className="text-xl font-semibold sm:text-2xl">TikTok login replaces email codes</h2>
        <p className="text-sm text-slate-400 sm:text-base">
          We no longer issue one-time passcodes to
          {" "}
          <span className="font-medium text-slate-200">{emailHint ?? "your email"}</span>. Use the TikTok login entry point to
          authenticate instead. Once the OpenSDK completes, you&apos;ll be redirected back to the page you started from.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          Looking for your account? Start the TikTok flow from the login or signup pages—no email code required.
        </p>
      </CardContent>
      <CardFooter className="sticky bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-950/80 backdrop-blur-md md:static md:bg-transparent md:backdrop-blur-none">
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            setIsNavigating(true);
            if (typeof window !== "undefined") {
              window.location.href = loginHref;
            } else {
              setIsNavigating(false);
            }
          }}
          disabled={isNavigating}
        >
          {isNavigating ? "Opening TikTok login…" : "Continue with TikTok"}
        </Button>
        <p className="text-xs text-slate-500 sm:text-sm">
          Need to create an account? <a href={signupHref} className="text-emerald-400 underline">Sign up with TikTok</a>.
        </p>
      </CardFooter>
    </Card>
  );
}

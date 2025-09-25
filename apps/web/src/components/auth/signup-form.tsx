"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, CardContent, CardFooter, CardHeader, Input, Label } from "@trendpot/ui";
import { requestEmailOtp } from "@/lib/auth-client";

function resolveDeviceLabel() {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const platform = navigator.platform || "web";
  const userAgent = navigator.userAgent || "browser";
  return `${platform} · ${userAgent.split(" ")[0]}`.slice(0, 80);
}

interface SignupFormProps {
  nextPath?: string;
}

export function SignupForm({ nextPath }: SignupFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const deviceLabel = useMemo(() => resolveDeviceLabel(), []);

  const mutation = useMutation({
    mutationFn: requestEmailOtp,
    onSuccess: ({ challenge }) => {
      const params = new URLSearchParams({
        email,
        token: challenge.token,
        expiresAt: challenge.expiresAt,
        deliveryHint: challenge.deliveryHint,
        intent: "signup",
        displayName
      });
      if (nextPath) {
        params.set("next", nextPath);
      }
      router.push(`/auth/verify?${params.toString()}`);
    },
    onError: (cause: unknown) => {
      if (cause instanceof Error) {
        setError(cause.message);
      } else {
        setError("We couldn't send the code. Please try again.");
      }
    }
  });

  const canSubmit = email.trim().length > 0 && displayName.trim().length > 1;

  const cardFooterClassName =
    "sticky bottom-0 left-0 right-0 flex flex-col gap-3 border-t border-slate-800 bg-slate-950/80 px-6 py-5 backdrop-blur-md " +
    "md:static md:bg-transparent md:backdrop-blur-none";

  return (
    <Card className="relative mx-auto flex w-full max-w-lg flex-col overflow-hidden backdrop-blur">
      <CardHeader className="gap-3">
        <h2 className="text-xl font-semibold sm:text-2xl">Create your TrendPot account</h2>
        <p className="text-sm text-slate-400 sm:text-base">
          We'll capture your display name now and follow up with a one-time passcode so you can complete enrollment.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="signup-email" requiredIndicator>
            Email address
          </Label>
          <Input
            id="signup-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={mutation.isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="signup-name" requiredIndicator>
            Display name
          </Label>
          <Input
            id="signup-name"
            name="displayName"
            autoComplete="nickname"
            placeholder="TrendPot Creator"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={mutation.isPending}
          />
        </div>
        {error ? (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
        ) : null}
        <p className="text-xs text-slate-500 sm:text-sm">
          We support passwordless authentication with short-lived one-time passcodes. You'll be asked to confirm your email before
          accessing any protected features.
        </p>
      </CardContent>
      <CardFooter className={cardFooterClassName}>
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            setError(null);
            mutation.mutate({ email, displayName, deviceLabel });
          }}
          disabled={mutation.isPending || !canSubmit}
        >
          {mutation.isPending ? "Sending..." : "Send signup code"}
        </Button>
        <p className="text-xs text-slate-500 sm:text-sm">
          Already have an account? <a href="/login" className="text-emerald-400 underline">Return to login</a>.
        </p>
      </CardFooter>
    </Card>
  );
}

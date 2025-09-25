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

interface LoginFormProps {
  nextPath?: string;
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
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
        intent: "login"
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

  const cardFooterClassName =
    "sticky bottom-0 left-0 right-0 flex flex-col gap-3 border-t border-slate-800 bg-slate-950/80 px-6 py-5 backdrop-blur-md " +
    "md:static md:bg-transparent md:backdrop-blur-none";

  return (
    <Card className="relative mx-auto flex w-full max-w-lg flex-col overflow-hidden backdrop-blur">
      <CardHeader className="gap-3">
        <h2 className="text-xl font-semibold sm:text-2xl">Welcome back</h2>
        <p className="text-sm text-slate-400 sm:text-base">
          Enter your email address and we'll send a one-time passcode to help you sign in securely.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email" requiredIndicator>
            Email address
          </Label>
          <Input
            id="login-email"
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
        {error ? (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
        ) : null}
        <p className="text-xs text-slate-500 sm:text-sm">
          We'll send a six digit code to your inbox. Codes expire after ten minutes and can only be used once.
        </p>
      </CardContent>
      <CardFooter className={cardFooterClassName}>
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            setError(null);
            mutation.mutate({ email, deviceLabel });
          }}
          disabled={mutation.isPending || email.trim().length === 0}
        >
          {mutation.isPending ? "Sending..." : "Send login code"}
        </Button>
        <p className="text-xs text-slate-500 sm:text-sm">
          Need an account? <a href="/signup" className="text-emerald-400 underline">Sign up for TrendPot</a>.
        </p>
      </CardFooter>
    </Card>
  );
}

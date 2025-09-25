"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, CardContent, CardFooter, CardHeader, Input, Label } from "@trendpot/ui";
import { verifyEmailOtp } from "@/lib/auth-client";

interface VerifyFormProps {
  email: string;
  token: string;
  expiresAt?: string;
  deliveryHint?: string;
  displayName?: string;
  intent?: string;
  nextPath?: string;
}

function resolveDeviceLabel() {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const platform = navigator.platform || "web";
  const userAgent = navigator.userAgent || "browser";
  return `${platform} · ${userAgent.split(" ")[0]}`.slice(0, 80);
}

export function VerifyForm({ email, token, expiresAt, deliveryHint, displayName, intent, nextPath }: VerifyFormProps) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const deviceLabel = useMemo(() => resolveDeviceLabel(), []);

  const mutation = useMutation({
    mutationFn: verifyEmailOtp,
    onSuccess: () => {
      router.push(nextPath ?? "/account");
    },
    onError: (cause: unknown) => {
      if (cause instanceof Error) {
        setError(cause.message);
      } else {
        setError("We couldn't verify the code. Please try again.");
      }
    }
  });

  const expiresCopy = expiresAt ? new Date(expiresAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : null;

  const cardFooterClassName =
    "sticky bottom-0 left-0 right-0 flex flex-col gap-3 border-t border-slate-800 bg-slate-950/80 px-6 py-5 backdrop-blur-md " +
    "md:static md:bg-transparent md:backdrop-blur-none";

  return (
    <Card className="relative mx-auto flex w-full max-w-lg flex-col overflow-hidden backdrop-blur">
      <CardHeader className="gap-3">
        <h2 className="text-xl font-semibold sm:text-2xl">Check your email</h2>
        <p className="text-sm text-slate-400 sm:text-base">
          We've sent a six digit code to <span className="font-medium text-slate-200">{deliveryHint ?? email}</span>.
          {displayName ? ` Welcome aboard, ${displayName}!` : ""} Enter the code below to continue.
        </p>
        {expiresCopy ? <p className="text-xs text-slate-500">Expires at {expiresCopy}.</p> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="otp" requiredIndicator>
            One-time code
          </Label>
          <Input
            id="otp"
            name="otp"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="123456"
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            disabled={mutation.isPending}
          />
        </div>
        {error ? (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
        ) : null}
        <p className="text-xs text-slate-500 sm:text-sm">
          Having trouble? You can request a new code from the {intent === "signup" ? "signup" : "login"} page.
        </p>
      </CardContent>
      <CardFooter className={cardFooterClassName}>
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            setError(null);
            mutation.mutate({ email, otpCode: otp, token, deviceLabel });
          }}
          disabled={mutation.isPending || otp.length !== 6}
        >
          {mutation.isPending ? "Verifying..." : "Verify code"}
        </Button>
        <p className="text-xs text-slate-500 sm:text-sm">
          Entered the wrong email? <a href={intent === "signup" ? "/signup" : "/login"} className="text-emerald-400 underline">Go back</a>.
        </p>
      </CardFooter>
    </Card>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { resolveNextPath } from "@/lib/navigation";
import { loadViewerOnServer } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Sign up · TrendPot",
  description: "Create your TrendPot account with a passwordless, secure onboarding flow."
};

interface SignupPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const viewer = await loadViewerOnServer();
  const nextPath = resolveNextPath(typeof searchParams.next === "string" ? searchParams.next : null);

  if (viewer.user) {
    redirect(nextPath ?? "/account");
  }

  return (
    <section className="flex flex-col gap-10">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold sm:text-4xl">Create an account</h1>
        <p className="max-w-xl text-sm text-slate-400 sm:text-base">
          Start with your email and display name. We'll send a one-time passcode to finish enrollment on this device.
        </p>
      </div>
      <SignupForm nextPath={nextPath ?? undefined} />
    </section>
  );
}

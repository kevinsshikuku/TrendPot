import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/signup-form";
import { resolveNextPath } from "@/lib/navigation";
import { loadViewerOnServer } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Sign up · TrendPot",
  description: "Create your TrendPot account by continuing with TikTok—no email codes required."
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
          Explore challenges as a guest and, when you're ready to participate or support creators, continue with TikTok.
          We'll bring back your session and collect any extra profile info only when it's required.
        </p>
      </div>
      <SignupForm nextPath={nextPath ?? undefined} />
    </section>
  );
}

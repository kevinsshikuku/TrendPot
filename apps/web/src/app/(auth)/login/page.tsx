import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { resolveNextPath } from "@/lib/navigation";
import { loadViewerOnServer } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Login · TrendPot",
  description: "Sign in to access TrendPot's creator dashboards and donation tooling."
};

interface LoginPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const viewer = await loadViewerOnServer();
  const nextPath = resolveNextPath(typeof searchParams.next === "string" ? searchParams.next : null);

  if (viewer.user) {
    redirect(nextPath ?? "/account");
  }

  return (
    <section className="flex flex-col gap-10">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold sm:text-4xl">Secure login</h1>
        <p className="max-w-xl text-sm text-slate-400 sm:text-base">
          TrendPot uses passwordless authentication so you can verify your email address quickly without juggling passwords.
        </p>
      </div>
      <LoginForm nextPath={nextPath ?? undefined} />
    </section>
  );
}

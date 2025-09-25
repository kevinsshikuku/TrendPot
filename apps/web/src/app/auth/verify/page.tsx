import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VerifyForm } from "@/components/auth/verify-form";
import { resolveNextPath } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Verify passcode · TrendPot",
  description: "Enter the one-time passcode sent to your email to continue."
};

interface VerifyPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default function VerifyPage({ searchParams }: VerifyPageProps) {
  const email = typeof searchParams.email === "string" ? searchParams.email : undefined;
  const token = typeof searchParams.token === "string" ? searchParams.token : undefined;

  if (!email || !token) {
    redirect("/login");
  }

  const expiresAt = typeof searchParams.expiresAt === "string" ? searchParams.expiresAt : undefined;
  const deliveryHint = typeof searchParams.deliveryHint === "string" ? searchParams.deliveryHint : undefined;
  const displayName = typeof searchParams.displayName === "string" ? searchParams.displayName : undefined;
  const intent = typeof searchParams.intent === "string" ? searchParams.intent : undefined;
  const nextPath = resolveNextPath(typeof searchParams.next === "string" ? searchParams.next : null);

  return (
    <section className="flex flex-col gap-10">
      <VerifyForm
        email={email}
        token={token}
        expiresAt={expiresAt}
        deliveryHint={deliveryHint}
        displayName={displayName}
        intent={intent}
        nextPath={nextPath ?? undefined}
      />
    </section>
  );
}

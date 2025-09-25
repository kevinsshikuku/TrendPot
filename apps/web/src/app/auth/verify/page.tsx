import type { Metadata } from "next";
import { VerifyForm } from "@/components/auth/verify-form";
import { resolveNextPath } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "TikTok login · TrendPot",
  description: "Authenticate with TikTok to access your TrendPot account.",
};

interface VerifyPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default function VerifyPage({ searchParams }: VerifyPageProps) {
  const email = typeof searchParams.email === "string" ? searchParams.email : undefined;
  const deliveryHint = typeof searchParams.deliveryHint === "string" ? searchParams.deliveryHint : undefined;
  const nextPath = resolveNextPath(typeof searchParams.next === "string" ? searchParams.next : null);

  return (
    <section className="flex flex-col gap-10">
      <VerifyForm emailHint={deliveryHint ?? email} nextPath={nextPath ?? undefined} />
    </section>
  );
}

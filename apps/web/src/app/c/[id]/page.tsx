import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { ChallengeDetail } from "../../../components/challenges/challenge-detail";
import { challengeQueryOptions } from "../../../lib/challenge-queries";

interface ChallengePageProps {
  params: { id: string };
}

export default async function ChallengePage({ params }: ChallengePageProps) {
  const challengeId = params.id;
  const queryClient = new QueryClient();
  const challenge = await queryClient.fetchQuery(challengeQueryOptions(challengeId));

  if (!challenge) {
    notFound();
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChallengeDetail challengeId={challengeId} />
    </HydrationBoundary>
  );
}

import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { ChallengesContent } from "../../components/challenges/challenges-content";
import { challengesQueryOptions } from "../../lib/challenge-queries";

export default async function ChallengesPage() {
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery(challengesQueryOptions());

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChallengesContent />
    </HydrationBoundary>
  );
}

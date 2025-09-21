import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { HomeContent } from "../components/home/home-content";
import { featuredChallengesQueryOptions } from "../lib/challenge-queries";

export default async function HomePage() {
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery(featuredChallengesQueryOptions());

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HomeContent />
    </HydrationBoundary>
  );
}

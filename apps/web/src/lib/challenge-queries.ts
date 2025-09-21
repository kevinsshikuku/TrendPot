import type { ChallengeSummary } from "@trendpot/types";
import { apiClient } from "./api-client";

export const featuredChallengesParams = { status: "live", limit: 6 } as const;
export const FEATURED_CHALLENGE_LIMIT = featuredChallengesParams.limit;

export const featuredChallengesQueryKey = ["challenges", "featured", featuredChallengesParams] as const;

export const fetchFeaturedChallenges = async (): Promise<ChallengeSummary[]> => {
  return apiClient.getFeaturedChallenges(featuredChallengesParams);
};

export const featuredChallengesQueryOptions = () => ({
  queryKey: featuredChallengesQueryKey,
  queryFn: fetchFeaturedChallenges,
  staleTime: 1000 * 30
});

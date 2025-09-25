import type { Challenge, ChallengeSummary, CreateChallengeInput } from "@trendpot/types";
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

export const challengesQueryKey = (params?: { status?: string }) => ["challenges", "list", params ?? {}] as const;

export const fetchChallenges = async (params: { status?: string } = {}): Promise<ChallengeSummary[]> => {
  return apiClient.listChallenges(params);
};

export const challengesQueryOptions = (params: { status?: string } = {}) => ({
  queryKey: challengesQueryKey(params),
  queryFn: () => fetchChallenges(params)
});

export const challengeQueryKey = (id: string) => ["challenges", "detail", id] as const;

export const fetchChallenge = async (id: string): Promise<Challenge | null> => {
  return apiClient.getChallenge(id);
};

export const challengeQueryOptions = (id: string) => ({
  queryKey: challengeQueryKey(id),
  queryFn: () => fetchChallenge(id)
});

export const createChallengeMutation = async (input: CreateChallengeInput) => {
  return apiClient.createChallenge(input);
};

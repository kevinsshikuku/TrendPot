import type {
  ArchiveChallengeInput,
  Challenge,
  ChallengeList,
  ChallengeListRequest,
  ChallengeSummary,
  CreateChallengeInput,
  UpdateChallengeInput
} from "@trendpot/types";
import { GraphQLRequestError, apiClient } from "./api-client";
import { ProfileCompletionRequiredError } from "./errors";

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

export const challengeAdminListQueryKey = (params: ChallengeListRequest = {}) => [
  "challenges",
  "admin",
  params
] as const;

export const fetchChallengeAdminList = async (params: ChallengeListRequest = {}): Promise<ChallengeList> => {
  return apiClient.getChallengeAdminList(params);
};

export const challengeAdminListQueryOptions = (params: ChallengeListRequest = {}) => ({
  queryKey: challengeAdminListQueryKey(params),
  queryFn: () => fetchChallengeAdminList(params)
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
  try {
    return await apiClient.createChallenge(input);
  } catch (error) {
    if (error instanceof GraphQLRequestError && error.messages.length > 0) {
      const profileError = error.errors.find((entry) => entry.extensions?.code === "PROFILE_INCOMPLETE");
      if (profileError) {
        const missingFields = Array.isArray(profileError.extensions?.missingFields)
          ? (profileError.extensions?.missingFields as string[])
          : [];
        throw new ProfileCompletionRequiredError(missingFields, profileError.message);
      }
      throw new Error(error.messages[0]);
    }
    throw error;
  }
};

export const updateChallengeMutation = async (input: UpdateChallengeInput) => {
  try {
    return await apiClient.updateChallenge(input);
  } catch (error) {
    if (error instanceof GraphQLRequestError && error.messages.length > 0) {
      const profileError = error.errors.find((entry) => entry.extensions?.code === "PROFILE_INCOMPLETE");
      if (profileError) {
        const missingFields = Array.isArray(profileError.extensions?.missingFields)
          ? (profileError.extensions?.missingFields as string[])
          : [];
        throw new ProfileCompletionRequiredError(missingFields, profileError.message);
      }
      throw new Error(error.messages[0]);
    }
    throw error;
  }
};

export const archiveChallengeMutation = async (input: ArchiveChallengeInput) => {
  try {
    return await apiClient.archiveChallenge(input);
  } catch (error) {
    if (error instanceof GraphQLRequestError && error.messages.length > 0) {
      const profileError = error.errors.find((entry) => entry.extensions?.code === "PROFILE_INCOMPLETE");
      if (profileError) {
        const missingFields = Array.isArray(profileError.extensions?.missingFields)
          ? (profileError.extensions?.missingFields as string[])
          : [];
        throw new ProfileCompletionRequiredError(missingFields, profileError.message);
      }
      throw new Error(error.messages[0]);
    }
    throw error;
  }
};

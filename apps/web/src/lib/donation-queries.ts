import type {
  Donation,
  DonationHistoryEntry,
  DonationSubmissionContext,
  DonationHistoryParams,
  RequestStkPushInput
} from "@trendpot/types";
import { GraphQLRequestError, apiClient } from "./api-client";
import { ProfileCompletionRequiredError } from "./errors";

export const donationStatusQueryKey = (donationId: string) =>
  ["donations", "status", donationId] as const;

export const fetchDonationStatus = async (donationId: string): Promise<Donation | null> => {
  return apiClient.getDonation(donationId);
};

export const donationStatusQueryOptions = (donationId: string) => ({
  queryKey: donationStatusQueryKey(donationId),
  queryFn: () => fetchDonationStatus(donationId),
  enabled: donationId.length > 0
});

export const donationHistoryQueryKey = (params: DonationHistoryParams = {}) =>
  ["donations", "history", params] as const;

export const fetchDonationHistory = async (
  params: DonationHistoryParams = {}
): Promise<DonationHistoryEntry[]> => {
  return apiClient.getViewerDonationHistory(params);
};

export const donationHistoryQueryOptions = (params: DonationHistoryParams = {}) => ({
  queryKey: donationHistoryQueryKey(params),
  queryFn: () => fetchDonationHistory(params),
  staleTime: 1000 * 60
});

export const submissionDonationContextQueryKey = (submissionId: string) =>
  ["donations", "context", submissionId] as const;

export const fetchSubmissionDonationContext = async (
  submissionId: string
): Promise<DonationSubmissionContext | null> => {
  return apiClient.getSubmissionDonationContext(submissionId);
};

export const submissionDonationContextQueryOptions = (submissionId: string) => ({
  queryKey: submissionDonationContextQueryKey(submissionId),
  queryFn: () => fetchSubmissionDonationContext(submissionId)
});

export const requestStkPushMutation = async (input: RequestStkPushInput): Promise<Donation> => {
  try {
    return await apiClient.requestStkPush(input);
  } catch (error) {
    if (error instanceof GraphQLRequestError && error.errors.length > 0) {
      const profileError = error.errors.find((entry) => entry.extensions?.code === "PROFILE_INCOMPLETE");
      if (profileError) {
        const missingFields = Array.isArray(profileError.extensions?.missingFields)
          ? (profileError.extensions?.missingFields as string[])
          : [];
        throw new ProfileCompletionRequiredError(missingFields, profileError.message);
      }
      throw new Error(error.errors[0].message);
    }
    throw error;
  }
};

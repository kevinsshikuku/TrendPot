import type {
  CreatorDonationConnection,
  CreatorDonationsRequest,
  PayoutBatchConnection,
  PayoutBatchesRequest,
  PayoutNotificationConnection,
  PayoutNotificationsRequest,
  GraphQLOperationOptions
} from "@trendpot/types";
import { GraphQLRequestError, apiClient } from "./api-client";

export const creatorDonationsQueryKey = (params: CreatorDonationsRequest = {}) =>
  ["payouts", "creator", "donations", params] as const;

export const fetchCreatorDonations = async (
  params: CreatorDonationsRequest = {},
  options: GraphQLOperationOptions = {}
): Promise<CreatorDonationConnection> => {
  return apiClient.getCreatorDonations(params, options);
};

export const creatorDonationsQueryOptions = (params: CreatorDonationsRequest = {}) => ({
  queryKey: creatorDonationsQueryKey(params),
  queryFn: () => fetchCreatorDonations(params),
  staleTime: 1000 * 30
});

export const payoutBatchesQueryKey = (params: PayoutBatchesRequest = {}) =>
  ["payouts", "creator", "batches", params] as const;

export const fetchPayoutBatches = async (
  params: PayoutBatchesRequest = {},
  options: GraphQLOperationOptions = {}
): Promise<PayoutBatchConnection> => {
  return apiClient.getPayoutBatches(params, options);
};

export const payoutBatchesQueryOptions = (params: PayoutBatchesRequest = {}) => ({
  queryKey: payoutBatchesQueryKey(params),
  queryFn: () => fetchPayoutBatches(params),
  staleTime: 1000 * 30
});

export const payoutNotificationsQueryKey = (params: PayoutNotificationsRequest = {}) =>
  ["payouts", "creator", "notifications", params] as const;

export const fetchPayoutNotifications = async (
  params: PayoutNotificationsRequest = {},
  options: GraphQLOperationOptions = {}
): Promise<PayoutNotificationConnection> => {
  return apiClient.getPayoutNotificationFeed(params, options);
};

export const payoutNotificationsQueryOptions = (params: PayoutNotificationsRequest = {}) => ({
  queryKey: payoutNotificationsQueryKey(params),
  queryFn: () => fetchPayoutNotifications(params),
  refetchInterval: 1000 * 30,
  staleTime: 1000 * 15
});

export const markPayoutNotificationsRead = async (ids: string[]): Promise<number> => {
  try {
    return await apiClient.markPayoutNotificationsRead(ids);
  } catch (error) {
    if (error instanceof GraphQLRequestError && error.messages.length > 0) {
      throw new Error(error.messages[0]);
    }

    throw error;
  }
};

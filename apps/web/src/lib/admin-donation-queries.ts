import type {
  AdminDonationConnection,
  AdminDonationFilterInput,
  AdminDonationMetrics,
  GraphQLOperationOptions,
  ListAdminDonationsParams
} from "@trendpot/types";
import { GraphQLRequestError, apiClient } from "./api-client";

export interface AdminDonationsQueryParams extends ListAdminDonationsParams {}

const normalizeDateInput = (value: string | Date | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.isNaN(Date.parse(trimmed)) ? null : new Date(trimmed);
  return parsed ? parsed.toISOString() : trimmed;
};

export const normalizeAdminDonationFilter = (
  filter?: AdminDonationFilterInput,
): AdminDonationFilterInput | undefined => {
  if (!filter) {
    return undefined;
  }

  const normalized: AdminDonationFilterInput = {};

  if (filter.statuses && filter.statuses.length > 0) {
    normalized.statuses = [...new Set(filter.statuses)].sort();
  }

  if (filter.payoutStates && filter.payoutStates.length > 0) {
    normalized.payoutStates = [...new Set(filter.payoutStates)].sort();
  }

  if (filter.challengeId && filter.challengeId.trim().length > 0) {
    normalized.challengeId = filter.challengeId.trim();
  }

  if (filter.creatorUserId && filter.creatorUserId.trim().length > 0) {
    normalized.creatorUserId = filter.creatorUserId.trim();
  }

  const donatedAfter = normalizeDateInput(filter.donatedAfter as string | Date | undefined);
  if (donatedAfter) {
    normalized.donatedAfter = donatedAfter;
  }

  const donatedBefore = normalizeDateInput(filter.donatedBefore as string | Date | undefined);
  if (donatedBefore) {
    normalized.donatedBefore = donatedBefore;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

export const normalizeAdminDonationsParams = (
  params: AdminDonationsQueryParams = {},
): AdminDonationsQueryParams => {
  const normalized: AdminDonationsQueryParams = {};

  if (typeof params.first === "number") {
    normalized.first = params.first;
  }

  if (typeof params.after === "string" && params.after.trim().length > 0) {
    normalized.after = params.after.trim();
  }

  const filter = normalizeAdminDonationFilter(params.filter);
  if (filter) {
    normalized.filter = filter;
  }

  return normalized;
};

const buildFilterKey = (filter?: AdminDonationFilterInput) => {
  const normalized = normalizeAdminDonationFilter(filter);
  return JSON.stringify(normalized ?? {});
};

export const adminDonationsQueryKey = (params: AdminDonationsQueryParams = {}) => [
  "admin",
  "donations",
  "list",
  params.first ?? null,
  buildFilterKey(params.filter)
];

export const adminDonationMetricsQueryKey = (filter?: AdminDonationFilterInput) => [
  "admin",
  "donations",
  "metrics",
  buildFilterKey(filter)
];

export const fetchAdminDonations = async (
  params: AdminDonationsQueryParams = {},
  options: GraphQLOperationOptions = {}
): Promise<AdminDonationConnection> => {
  try {
    const normalized = normalizeAdminDonationsParams(params);
    return await apiClient.listAdminDonations(normalized, options);
  } catch (error) {
    if (error instanceof GraphQLRequestError && error.messages.length > 0) {
      throw new Error(error.messages[0]);
    }

    throw error;
  }
};

export const fetchAdminDonationMetrics = async (
  filter?: AdminDonationFilterInput,
  options: GraphQLOperationOptions = {}
): Promise<AdminDonationMetrics> => {
  try {
    const normalized = normalizeAdminDonationFilter(filter);
    return await apiClient.getAdminDonationMetrics(normalized, options);
  } catch (error) {
    if (error instanceof GraphQLRequestError && error.messages.length > 0) {
      throw new Error(error.messages[0]);
    }

    throw error;
  }
};

export const adminDonationsQueryOptions = (
  params: AdminDonationsQueryParams = {},
  options: GraphQLOperationOptions = {}
) => ({
  queryKey: adminDonationsQueryKey(params),
  queryFn: () => fetchAdminDonations(params, options),
  staleTime: 1000 * 30
});

export const adminDonationMetricsQueryOptions = (
  filter?: AdminDonationFilterInput,
  options: GraphQLOperationOptions = {}
) => ({
  queryKey: adminDonationMetricsQueryKey(filter),
  queryFn: () => fetchAdminDonationMetrics(filter, options),
  staleTime: 1000 * 30
});

import type { AdminDonationFilterInput, DonationPayoutState, DonationStatus } from "@trendpot/types";

type AdminFilterState = {
  statuses: DonationStatus[];
  payoutStates: DonationPayoutState[];
  challengeId: string;
  creatorUserId: string;
  donatedAfter: string | null;
  donatedBefore: string | null;
};

const defaultFilterState: AdminFilterState = {
  statuses: [],
  payoutStates: [],
  challengeId: "",
  creatorUserId: "",
  donatedAfter: null,
  donatedBefore: null
};

const donationStatusOptions: DonationStatus[] = [
  "pending",
  "processing",
  "succeeded",
  "failed",
  "refunded"
];

const payoutStateOptions: DonationPayoutState[] = [
  "unassigned",
  "scheduled",
  "processing",
  "paid",
  "failed"
];

const toDateISOString = (value: string | null, endOfDay = false): string | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  if (endOfDay) {
    parsed.setUTCHours(23, 59, 59, 999);
  } else {
    parsed.setUTCHours(0, 0, 0, 0);
  }

  return parsed.toISOString();
};

const buildFilterInput = (state: AdminFilterState): AdminDonationFilterInput | undefined => {
  const input: AdminDonationFilterInput = {};

  if (state.statuses.length > 0) {
    input.statuses = [...state.statuses].sort();
  }

  if (state.payoutStates.length > 0) {
    input.payoutStates = [...state.payoutStates].sort();
  }

  if (state.challengeId.trim()) {
    input.challengeId = state.challengeId.trim();
  }

  if (state.creatorUserId.trim()) {
    input.creatorUserId = state.creatorUserId.trim();
  }

  const donatedAfter = toDateISOString(state.donatedAfter, false);
  if (donatedAfter) {
    input.donatedAfter = donatedAfter;
  }

  const donatedBefore = toDateISOString(state.donatedBefore, true);
  if (donatedBefore) {
    input.donatedBefore = donatedBefore;
  }

  return Object.keys(input).length > 0 ? input : undefined;
};

const countActiveFilters = (state: AdminFilterState) =>
  state.statuses.length +
  state.payoutStates.length +
  (state.challengeId.trim() ? 1 : 0) +
  (state.creatorUserId.trim() ? 1 : 0) +
  (state.donatedAfter ? 1 : 0) +
  (state.donatedBefore ? 1 : 0);

export {
  type AdminFilterState,
  buildFilterInput,
  defaultFilterState,
  donationStatusOptions,
  payoutStateOptions,
  toDateISOString,
  countActiveFilters
};

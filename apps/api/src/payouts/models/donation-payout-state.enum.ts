import { registerEnumType } from "@nestjs/graphql";

export enum DonationPayoutState {
  Unassigned = "unassigned",
  Scheduled = "scheduled",
  Processing = "processing",
  Paid = "paid",
  Failed = "failed"
}

registerEnumType(DonationPayoutState, {
  name: "DonationPayoutState",
  description: "Payout lifecycle state for a donation once it has cleared."
});

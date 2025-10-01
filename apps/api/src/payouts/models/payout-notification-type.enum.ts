import { registerEnumType } from "@nestjs/graphql";

export enum PayoutNotificationType {
  DonationCleared = "donation.cleared",
  PayoutScheduled = "payout.scheduled",
  PayoutProcessing = "payout.processing",
  PayoutPaid = "payout.paid",
  PayoutFailed = "payout.failed"
}

registerEnumType(PayoutNotificationType, {
  name: "PayoutNotificationType",
  description: "Event types surfaced in the creator payout notification center."
});

import { registerEnumType } from "@nestjs/graphql";
import { DonationPayoutState } from "../../donations/donation-payout-state.enum";

registerEnumType(DonationPayoutState, {
  name: "DonationPayoutState",
  description: "Lifecycle state of a donation within the payout pipeline."
});

export { DonationPayoutState };

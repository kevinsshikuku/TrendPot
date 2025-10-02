import { registerEnumType } from "@nestjs/graphql";
import { DonationStatus } from "../../donations/donation-status.enum";

registerEnumType(DonationStatus, {
  name: "DonationStatus",
  description: "Lifecycle status of a donor contribution."
});

export { DonationStatus };

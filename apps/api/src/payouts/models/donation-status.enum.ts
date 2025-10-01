import { registerEnumType } from "@nestjs/graphql";

export enum DonationStatus {
  Pending = "pending",
  Succeeded = "succeeded",
  Refunded = "refunded",
  Failed = "failed"
}

registerEnumType(DonationStatus, {
  name: "DonationStatus",
  description: "Lifecycle status of a donor contribution."
});

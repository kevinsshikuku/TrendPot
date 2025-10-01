import { registerEnumType } from "@nestjs/graphql";

export enum PayoutBatchStatus {
  Scheduled = "scheduled",
  Processing = "processing",
  Paid = "paid",
  Failed = "failed"
}

registerEnumType(PayoutBatchStatus, {
  name: "PayoutBatchStatus",
  description: "Processing status for a scheduled creator payout batch."
});

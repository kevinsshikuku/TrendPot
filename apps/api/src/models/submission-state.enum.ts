import { registerEnumType } from "@nestjs/graphql";

export enum SubmissionState {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Removed = "removed"
}

registerEnumType(SubmissionState, {
  name: "SubmissionState",
  description: "Lifecycle states for TikTok challenge submissions."
});

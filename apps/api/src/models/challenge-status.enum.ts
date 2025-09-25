import { registerEnumType } from "@nestjs/graphql";

// ChallengeStatus centralizes the lifecycle states for challenges and keeps
// the GraphQL schema, service layer, and frontend client in sync. Keeping the
// enum here avoids hard-coded strings sprinkled across the codebase.
export enum ChallengeStatus {
  Draft = "draft",
  Live = "live",
  Archived = "archived"
}

registerEnumType(ChallengeStatus, {
  name: "ChallengeStatus",
  description: "Lifecycle states that control how a challenge is displayed to creators and admins."
});

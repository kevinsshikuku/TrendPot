import { registerEnumType } from "@nestjs/graphql";
import type { UserStatus as UserStatusContract } from "@trendpot/types";

export enum UserStatusModel {
  Active = "active",
  Disabled = "disabled",
  PendingVerification = "pending_verification"
}

registerEnumType(UserStatusModel, {
  name: "UserStatus",
  description: "Lifecycle state representing whether the user can authenticate."
});

export const toUserStatusModel = (status: UserStatusContract): UserStatusModel => {
  switch (status) {
    case "active":
      return UserStatusModel.Active;
    case "disabled":
      return UserStatusModel.Disabled;
    case "pending_verification":
      return UserStatusModel.PendingVerification;
    default:
      return UserStatusModel.Disabled;
  }
};

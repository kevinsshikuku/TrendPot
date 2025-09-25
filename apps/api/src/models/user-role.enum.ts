import { registerEnumType } from "@nestjs/graphql";
import type { UserRole as UserRoleContract } from "@trendpot/types";

export enum UserRoleModel {
  Fan = "fan",
  Creator = "creator",
  Operator = "operator",
  Admin = "admin"
}

registerEnumType(UserRoleModel, {
  name: "UserRole",
  description: "Role assigned to an authenticated user that drives authorization across the platform."
});

export const toUserRoleModel = (role: UserRoleContract): UserRoleModel => {
  switch (role) {
    case "fan":
      return UserRoleModel.Fan;
    case "creator":
      return UserRoleModel.Creator;
    case "operator":
      return UserRoleModel.Operator;
    case "admin":
      return UserRoleModel.Admin;
    default:
      return UserRoleModel.Fan;
  }
};

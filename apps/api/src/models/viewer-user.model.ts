import { Field, ObjectType } from "@nestjs/graphql";
import type { AuthenticatedUser } from "../auth/auth.types";
import { toUserRoleModel, UserRoleModel } from "./user-role.enum";
import { toUserStatusModel, UserStatusModel } from "./user-status.enum";

@ObjectType("ViewerUser")
export class ViewerUserModel {
  @Field()
  declare id: string;

  @Field({ nullable: true })
  declare email: string | null;

  @Field({ nullable: true })
  declare phone?: string | null;

  @Field()
  declare displayName: string;

  @Field({ nullable: true })
  declare avatarUrl?: string | null;

  @Field({ nullable: true })
  declare tiktokUserId?: string | null;

  @Field({ nullable: true })
  declare tiktokUsername?: string | null;

  @Field(() => [String])
  declare tiktokScopes: string[];

  @Field(() => [UserRoleModel])
  declare roles: UserRoleModel[];

  @Field(() => [String])
  declare permissions: string[];

  @Field(() => UserStatusModel)
  declare status: UserStatusModel;

  @Field(() => Date)
  declare createdAt: Date;

  @Field(() => Date)
  declare updatedAt: Date;

  static fromUser(user: AuthenticatedUser): ViewerUserModel {
    const model = new ViewerUserModel();
    model.id = user.id;
    model.email = user.email ?? null;
    model.phone = user.phone ?? null;
    model.displayName = user.displayName;
    model.avatarUrl = user.avatarUrl ?? null;
    model.tiktokUserId = user.tiktokUserId ?? null;
    model.tiktokUsername = user.tiktokUsername ?? null;
    model.tiktokScopes = user.tiktokScopes ?? [];
    model.roles = user.roles.map((role) => toUserRoleModel(role));
    model.permissions = user.permissions;
    model.status = toUserStatusModel(user.status);
    model.createdAt = new Date(user.createdAt);
    model.updatedAt = new Date(user.updatedAt);
    return model;
  }
}

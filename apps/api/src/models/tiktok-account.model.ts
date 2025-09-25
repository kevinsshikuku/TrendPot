import { Field, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";

@ObjectType("TikTokAccount")
export class TikTokAccountModel {
  @Field()
  declare id: string;

  @Field()
  declare username: string;

  @Field({ nullable: true })
  declare displayName?: string | null;

  @Field({ nullable: true })
  declare avatarUrl?: string | null;

  @Field(() => [String])
  declare scopes: string[];

  @Field(() => GraphQLISODateTime)
  declare accessTokenExpiresAt: Date;

  @Field(() => GraphQLISODateTime)
  declare refreshTokenExpiresAt: Date;

  @Field(() => GraphQLISODateTime)
  declare createdAt: Date;

  @Field(() => GraphQLISODateTime)
  declare updatedAt: Date;
}

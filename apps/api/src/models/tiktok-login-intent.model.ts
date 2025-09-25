import { Field, ObjectType } from "@nestjs/graphql";

@ObjectType("TikTokLoginIntent")
export class TikTokLoginIntentModel {
  @Field()
  declare state: string;

  @Field()
  declare clientKey: string;

  @Field()
  declare redirectUri: string;

  @Field(() => [String])
  declare scopes: string[];

  @Field({ nullable: true })
  declare returnPath?: string | null;
}

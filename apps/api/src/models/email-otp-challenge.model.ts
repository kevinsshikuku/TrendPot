import { Field, ObjectType } from "@nestjs/graphql";

@ObjectType("EmailOtpChallenge")
export class EmailOtpChallengeModel {
  @Field()
  declare token: string;

  @Field(() => Date)
  declare expiresAt: Date;

  @Field()
  declare deliveryHint: string;
}

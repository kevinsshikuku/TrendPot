import { Field, Int, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";
import { ChallengeStatus } from "./challenge-status.enum";

@ObjectType("ChallengeSummary")
export class ChallengeSummaryModel {
  @Field()
  declare id: string;

  @Field()
  declare title: string;

  @Field()
  declare tagline: string;

  @Field(() => Int)
  declare raised: number;

  @Field(() => Int)
  declare goal: number;

  @Field()
  declare currency: string;

  @Field(() => ChallengeStatus)
  declare status: ChallengeStatus;

  @Field(() => GraphQLISODateTime)
  declare updatedAt: Date;

  @Field(() => Int)
  declare version: number;
}

import { Field, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";
import { ChallengeSummaryModel } from "./challenge-summary.model";

@ObjectType("Challenge")
export class ChallengeModel extends ChallengeSummaryModel {
  @Field()
  declare description: string;

  @Field()
  declare status: string;

  @Field(() => GraphQLISODateTime)
  declare createdAt: Date;

  @Field(() => GraphQLISODateTime)
  declare updatedAt: Date;
}

import { Field, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";
import { ChallengeSummaryModel } from "./challenge-summary.model";

@ObjectType("Challenge")
export class ChallengeModel extends ChallengeSummaryModel {
  @Field()
  declare description: string;

  @Field(() => GraphQLISODateTime)
  declare createdAt: Date;
}

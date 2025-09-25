import { Field, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";
import { ChallengeSummaryModel } from "./challenge-summary.model";
import { SubmissionConnectionModel } from "./submission-connection.model";

@ObjectType("Challenge")
export class ChallengeModel extends ChallengeSummaryModel {
  @Field()
  declare description: string;

  @Field(() => GraphQLISODateTime)
  declare createdAt: Date;

  @Field(() => SubmissionConnectionModel, { nullable: true })
  declare submissions?: SubmissionConnectionModel | null;
}

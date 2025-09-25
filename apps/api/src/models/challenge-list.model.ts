import { Field, Float, Int, ObjectType } from "@nestjs/graphql";
import { ChallengeSummaryModel } from "./challenge-summary.model";

@ObjectType("ChallengeStatusBreakdown")
export class ChallengeStatusBreakdownModel {
  @Field(() => Int)
  declare draft: number;

  @Field(() => Int)
  declare live: number;

  @Field(() => Int)
  declare archived: number;
}

@ObjectType("ChallengeListAnalytics")
export class ChallengeListAnalyticsModel {
  @Field(() => Int)
  declare totalChallenges: number;

  @Field(() => Int)
  declare totalRaised: number;

  @Field(() => Int)
  declare totalGoal: number;

  @Field(() => Float)
  declare averageCompletion: number;

  @Field(() => ChallengeStatusBreakdownModel)
  declare statusBreakdown: ChallengeStatusBreakdownModel;
}

@ObjectType("ChallengePageInfo")
export class ChallengePageInfoModel {
  @Field({ nullable: true })
  declare endCursor: string | null;

  @Field()
  declare hasNextPage: boolean;
}

@ObjectType("ChallengeEdge")
export class ChallengeEdgeModel {
  @Field()
  declare cursor: string;

  @Field(() => ChallengeSummaryModel)
  declare node: ChallengeSummaryModel;
}

@ObjectType("ChallengeList")
export class ChallengeListModel {
  @Field(() => [ChallengeEdgeModel])
  declare edges: ChallengeEdgeModel[];

  @Field(() => ChallengePageInfoModel)
  declare pageInfo: ChallengePageInfoModel;

  @Field(() => ChallengeListAnalyticsModel)
  declare analytics: ChallengeListAnalyticsModel;
}

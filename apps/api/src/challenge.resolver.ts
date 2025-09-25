import { Args, Int, Query, Resolver } from "@nestjs/graphql";
import type { ListChallengesParams } from "@trendpot/types";
import { AppService } from "./app.service";
import { ChallengeSummaryModel } from "./models/challenge-summary.model";

@Resolver(() => ChallengeSummaryModel)
export class ChallengeResolver {
  constructor(private readonly appService: AppService) {}

  @Query(() => [ChallengeSummaryModel], { name: "featuredChallenges" })
  featuredChallenges(
    @Args("status", { type: () => String, nullable: true }) status?: string,
    @Args("limit", { type: () => Int, nullable: true }) limit?: number
  ) {
    const params: ListChallengesParams = {};

    if (typeof status === "string" && status.length > 0) {
      params.status = status;
    }

    if (typeof limit === "number") {
      params.limit = limit;
    }

    return this.appService.getFeaturedChallenges(params);
  }
}

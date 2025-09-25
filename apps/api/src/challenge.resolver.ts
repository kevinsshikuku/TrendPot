import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import type { ListChallengesParams } from "@trendpot/types";
import { AppService } from "./app.service";
import { ChallengeListModel } from "./models/challenge-list.model";
import { ChallengeModel } from "./models/challenge.model";
import { ChallengeSummaryModel } from "./models/challenge-summary.model";
import { ChallengeListInputModel } from "./models/challenge-list.input";
import { CreateChallengeInputModel } from "./models/create-challenge.input";
import { ArchiveChallengeInputModel, UpdateChallengeInputModel } from "./models/update-challenge.input";

@Resolver(() => ChallengeModel)
export class ChallengeResolver {
  constructor(private readonly appService: AppService) {}

  @Query(() => [ChallengeSummaryModel], { name: "featuredChallenges" })
  async featuredChallenges(
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

  @Query(() => [ChallengeSummaryModel], { name: "challenges" })
  async challenges(
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

    return this.appService.listChallenges(params);
  }

  @Query(() => ChallengeListModel, { name: "challengeAdminList" })
  async challengeAdminList(@Args("input", { type: () => ChallengeListInputModel, nullable: true }) input?: ChallengeListInputModel) {
    return this.appService.paginateChallenges(input ?? {});
  }

  @Query(() => ChallengeModel, { name: "challenge", nullable: true })
  async challenge(@Args("id", { type: () => String }) id: string) {
    return this.appService.getChallenge(id);
  }

  @Mutation(() => ChallengeModel, { name: "createChallenge" })
  async createChallenge(@Args("input") input: CreateChallengeInputModel) {
    return this.appService.createChallenge(input);
  }

  @Mutation(() => ChallengeModel, { name: "updateChallenge" })
  async updateChallenge(@Args("input") input: UpdateChallengeInputModel) {
    return this.appService.updateChallenge(input);
  }

  @Mutation(() => ChallengeModel, { name: "archiveChallenge" })
  async archiveChallenge(@Args("input") input: ArchiveChallengeInputModel) {
    return this.appService.archiveChallenge(input);
  }
}

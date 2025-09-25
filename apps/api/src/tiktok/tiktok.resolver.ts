import { UnauthorizedException } from "@nestjs/common";
import { Args, Context, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Roles, RateLimit, RequireProfileFields } from "../auth/auth.decorators";
import type { GraphQLContext } from "../observability/graphql-context";
import { VideoConnectionModel } from "../models/video-connection.model";
import { SubmissionModel } from "../models/submission.model";
import { SubmitToChallengeInputModel } from "../models/submit-to-challenge.input";
import { TikTokDisplayService } from "./tiktok.service";

@Resolver()
export class TikTokResolver {
  constructor(private readonly tiktokService: TikTokDisplayService) {}

  @Roles("creator")
  @RequireProfileFields("displayName")
  @RateLimit({ windowMs: 60_000, max: 30 })
  @Query(() => VideoConnectionModel, { name: "creatorVideos" })
  async creatorVideos(
    @Args("first", { type: () => Int, nullable: true }) first: number | undefined,
    @Args("after", { type: () => String, nullable: true }) after: string | undefined,
    @Context() context: GraphQLContext
  ) {
    if (!context.user) {
      throw new UnauthorizedException("Authentication required.");
    }

    return this.tiktokService.listCreatorVideos({
      user: context.user,
      first,
      after,
      logger: context.logger,
      requestId: context.requestId
    });
  }

  @Roles("creator")
  @RequireProfileFields("displayName")
  @RateLimit({ windowMs: 60_000, max: 10 })
  @Mutation(() => SubmissionModel, { name: "submitToChallenge" })
  async submitToChallenge(
    @Args("input") input: SubmitToChallengeInputModel,
    @Context() context: GraphQLContext
  ) {
    if (!context.user) {
      throw new UnauthorizedException("Authentication required.");
    }

    const userAgentHeader = context.request?.headers["user-agent"];
    const userAgent = typeof userAgentHeader === "string" ? userAgentHeader : undefined;

    return this.tiktokService.submitToChallenge({
      user: context.user,
      challengeId: input.challengeId,
      tiktokVideoId: input.tiktokVideoId,
      logger: context.logger,
      requestId: context.requestId,
      ipAddress: context.request?.ip,
      userAgent
    });
  }
}


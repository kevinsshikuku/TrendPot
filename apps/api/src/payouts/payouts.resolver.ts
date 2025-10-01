import { Args, Context, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Roles } from "../auth/auth.decorators";
import type { GraphQLContext } from "../observability/graphql-context";
import { PayoutsService } from "./payouts.service";
import { CreatorDonationConnectionModel } from "./models/creator-donation.model";
import { PayoutBatchConnectionModel } from "./models/payout-batch.model";
import { PayoutNotificationConnectionModel } from "./models/payout-notification.model";

@Resolver()
export class PayoutsResolver {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Roles("creator", "operator", "admin")
  @Query(() => CreatorDonationConnectionModel, { name: "creatorDonations" })
  async creatorDonations(
    @Context() context: GraphQLContext,
    @Args("first", { type: () => Int, nullable: true }) first?: number,
    @Args("after", { type: () => String, nullable: true }) after?: string
  ) {
    const user = this.requireUser(context);
    return this.payoutsService.listCreatorDonations(user.id, { first, after });
  }

  @Roles("creator", "operator", "admin")
  @Query(() => PayoutBatchConnectionModel, { name: "payoutBatches" })
  async payoutBatches(
    @Context() context: GraphQLContext,
    @Args("first", { type: () => Int, nullable: true }) first?: number,
    @Args("after", { type: () => String, nullable: true }) after?: string
  ) {
    const user = this.requireUser(context);
    return this.payoutsService.listPayoutBatches(user.id, { first, after });
  }

  @Roles("creator", "operator", "admin")
  @Query(() => PayoutNotificationConnectionModel, { name: "payoutNotificationFeed" })
  async payoutNotificationFeed(
    @Context() context: GraphQLContext,
    @Args("first", { type: () => Int, nullable: true }) first?: number,
    @Args("after", { type: () => String, nullable: true }) after?: string
  ) {
    const user = this.requireUser(context);
    return this.payoutsService.listNotifications(user.id, { first, after });
  }

  @Roles("creator", "operator", "admin")
  @Mutation(() => Int, { name: "markPayoutNotificationsRead" })
  async markPayoutNotificationsRead(
    @Context() context: GraphQLContext,
    @Args("ids", { type: () => [String] }) ids: string[]
  ) {
    const user = this.requireUser(context);
    if (!Array.isArray(ids) || ids.length === 0) {
      return 0;
    }

    return this.payoutsService.markNotificationsRead(user.id, ids);
  }

  private requireUser(context: GraphQLContext) {
    const user = context.user;
    if (!user) {
      throw new UnauthorizedException("Authentication is required to access creator payouts.");
    }

    if (!user.roles.includes("creator") && !user.roles.includes("admin") && !user.roles.includes("operator")) {
      throw new ForbiddenException("You do not have permission to view payout data.");
    }

    return user;
  }
}

import { UnauthorizedException } from "@nestjs/common";
import { Args, Context, Mutation, Query, Resolver } from "@nestjs/graphql";
import { RateLimit, RequireProfileFields, Roles } from "../auth/auth.decorators";
import type { GraphQLContext } from "../observability/graphql-context";
import { DonationService } from "./donation.service";
import { DonationModel } from "./models/donation.model";
import { RequestDonationInputModel } from "./models/request-donation.input";

@Resolver(() => DonationModel)
export class DonationResolver {
  constructor(private readonly donationService: DonationService) {}

  @Roles("fan", "creator", "operator", "admin")
  @RequireProfileFields("displayName", "phone")
  @RateLimit({ windowMs: 60_000, max: 6 })
  @Mutation(() => DonationModel, { name: "requestStkPush" })
  async requestStkPush(
    @Args("input") input: RequestDonationInputModel,
    @Context() context: GraphQLContext
  ) {
    if (!context.user) {
      throw new UnauthorizedException("Authentication required.");
    }

    const logger =
      typeof context.logger.child === "function"
        ? context.logger.child({ module: "donations", requestId: context.requestId })
        : context.logger;

    return this.donationService.requestStkPush({
      submissionId: input.submissionId,
      donorUserId: context.user.id,
      amountCents: input.amountCents,
      msisdn: input.msisdn,
      idempotencyKey: input.idempotencyKey,
      accountReference: input.accountReference ?? undefined,
      narrative: input.narrative ?? undefined,
      requestId: context.requestId,
      logger
    });
  }

  @Roles("fan", "creator", "operator", "admin")
  @Query(() => DonationModel, { name: "donation", nullable: true })
  async donation(@Args("id", { type: () => String }) id: string, @Context() context: GraphQLContext) {
    if (!context.user) {
      throw new UnauthorizedException("Authentication required.");
    }

    return this.donationService.getDonationById(id);
  }

  @Roles("fan", "creator", "operator", "admin")
  @Query(() => DonationModel, { name: "donationByCheckout", nullable: true })
  async donationByCheckout(
    @Args("checkoutRequestId", { type: () => String }) checkoutRequestId: string,
    @Context() context: GraphQLContext
  ) {
    if (!context.user) {
      throw new UnauthorizedException("Authentication required.");
    }

    return this.donationService.getDonationByCheckoutRequestId(checkoutRequestId);
  }
}

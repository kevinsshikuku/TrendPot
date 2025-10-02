import { UnauthorizedException } from "@nestjs/common";
import { Args, Context, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { RateLimit, RequireProfileFields, Roles } from "../auth/auth.decorators";
import type { GraphQLContext } from "../observability/graphql-context";
import { DonationRequestsService } from "./services/donation-requests.service";
import { DonationModel } from "./models/donation.model";
import { RequestDonationInputModel } from "./models/request-donation.input";
import { DonationAdminService } from "./services/donation-admin.service";
import { AdminDonationConnectionModel } from "./models/admin-donation-connection.model";
import { AdminDonationFilterInputModel } from "./models/admin-donation-filter.input";
import { AdminDonationMetricsModel } from "./models/admin-donation-metrics.model";
import { AuditLogService } from "../audit/audit-log.service";

@Resolver(() => DonationModel)
export class DonationResolver {
  constructor(
    private readonly donationRequests: DonationRequestsService,
    private readonly donationAdmin: DonationAdminService,
    private readonly auditLogService: AuditLogService
  ) {}

  @Roles("fan", "creator", "operator", "admin")
  @RequireProfileFields("displayName", "phone")
  @RateLimit({ windowMs: 60_000, max: 6 })
  @Mutation(() => DonationModel, { name: "requestStkPush" })
  async requestStkPush(@Args("input") input: RequestDonationInputModel, @Context() context: GraphQLContext) {
    if (!context.user) {
      throw new UnauthorizedException("Authentication required.");
    }

    const logger =
      typeof context.logger.child === "function"
        ? context.logger.child({ module: "donations", requestId: context.requestId })
        : context.logger;

    return this.donationRequests.requestStkPush({
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

    return this.donationRequests.getDonationById(id);
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

    return this.donationRequests.getDonationByCheckoutRequestId(checkoutRequestId);
  }

  @Roles("operator", "admin")
  @RateLimit({ windowMs: 60_000, max: 20 })
  @Query(() => AdminDonationConnectionModel, { name: "adminDonations" })
  async adminDonations(
    @Context() context: GraphQLContext,
    @Args("first", { type: () => Int, nullable: true }) first?: number,
    @Args("after", { type: () => String, nullable: true }) after?: string,
    @Args("filter", { type: () => AdminDonationFilterInputModel, nullable: true })
    filter?: AdminDonationFilterInputModel | null
  ) {
    if (!context.user) {
      throw new UnauthorizedException("Authentication required.");
    }

    try {
      const result = await this.donationAdmin.listDonations({ first, after, filter: filter ?? undefined });

      await this.auditLogService
        .record({
          eventType: "donation.admin.list",
          actorType: "user",
          actorId: context.user.id,
          outcome: "succeeded",
          resourceType: "donation_admin",
          metadata: {
            requestId: context.requestId,
            filter: this.serializeFilter(filter),
            first: first ?? null,
            after: after ?? null,
            resultCount: result.totals.count,
            totalAmountCents: result.totals.grossAmountCents
          }
        })
        .catch(() => undefined);

      return result;
    } catch (error) {
      await this.auditLogService
        .record({
          eventType: "donation.admin.list",
          actorType: "user",
          actorId: context.user.id,
          outcome: "failed",
          resourceType: "donation_admin",
          metadata: {
            requestId: context.requestId,
            filter: this.serializeFilter(filter),
            error: (error as Error).message
          }
        })
        .catch(() => undefined);

      throw error;
    }
  }

  @Roles("operator", "admin")
  @RateLimit({ windowMs: 60_000, max: 30 })
  @Query(() => AdminDonationMetricsModel, { name: "adminDonationMetrics" })
  async adminDonationMetrics(
    @Context() context: GraphQLContext,
    @Args("filter", { type: () => AdminDonationFilterInputModel, nullable: true })
    filter?: AdminDonationFilterInputModel | null
  ) {
    if (!context.user) {
      throw new UnauthorizedException("Authentication required.");
    }

    try {
      const metrics = await this.donationAdmin.getMetrics(filter ?? undefined);

      await this.auditLogService
        .record({
          eventType: "donation.admin.metrics",
          actorType: "user",
          actorId: context.user.id,
          outcome: "succeeded",
          resourceType: "donation_admin",
          metadata: {
            requestId: context.requestId,
            filter: this.serializeFilter(filter),
            vatCollectedCents: metrics.vatCollectedCents,
            pendingPayoutCents: metrics.pendingPayoutCents,
            outstandingClearingBalanceCents: metrics.outstandingClearingBalanceCents
          }
        })
        .catch(() => undefined);

      return metrics;
    } catch (error) {
      await this.auditLogService
        .record({
          eventType: "donation.admin.metrics",
          actorType: "user",
          actorId: context.user.id,
          outcome: "failed",
          resourceType: "donation_admin",
          metadata: {
            requestId: context.requestId,
            filter: this.serializeFilter(filter),
            error: (error as Error).message
          }
        })
        .catch(() => undefined);

      throw error;
    }
  }

  private serializeFilter(filter?: AdminDonationFilterInputModel | null) {
    if (!filter) {
      return null;
    }

    const serialized: Record<string, unknown> = {};

    if (filter.statuses && filter.statuses.length > 0) {
      serialized.statuses = filter.statuses;
    }

    if (filter.payoutStates && filter.payoutStates.length > 0) {
      serialized.payoutStates = filter.payoutStates;
    }

    if (filter.creatorUserId) {
      serialized.creatorUserId = filter.creatorUserId;
    }

    if (filter.challengeId) {
      serialized.challengeId = filter.challengeId;
    }

    if (filter.donatedAfter) {
      serialized.donatedAfter = filter.donatedAfter.toISOString();
    }

    if (filter.donatedBefore) {
      serialized.donatedBefore = filter.donatedBefore.toISOString();
    }

    return Object.keys(serialized).length > 0 ? serialized : null;
  }
}

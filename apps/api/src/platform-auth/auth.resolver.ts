import { Args, Context, Mutation, Query, Resolver } from "@nestjs/graphql";
import { BadRequestException } from "@nestjs/common";
import { AllowAnonymous, RateLimit, Roles } from "../auth/auth.decorators";
import type { GraphQLContext } from "../observability/graphql-context";
import { PlatformAuthService } from "./platform-auth.service";
import { EmailOtpChallengeModel } from "../models/email-otp-challenge.model";
import { VerifyEmailOtpInputModel } from "../models/verify-email-otp.input";
import { ViewerModel } from "../models/viewer.model";
import { ViewerSessionModel } from "../models/viewer-session.model";
import { RequestEmailOtpInputModel } from "../models/request-email-otp.input";

@Resolver()
export class PlatformAuthResolver {
  constructor(private readonly platformAuthService: PlatformAuthService) {}

  @AllowAnonymous()
  @RateLimit({ windowMs: 60_000, max: 5 })
  @Mutation(() => EmailOtpChallengeModel, { name: "requestEmailOtp" })
  async requestEmailOtp(
    @Args("input", { type: () => RequestEmailOtpInputModel }) input: RequestEmailOtpInputModel,
    @Context() context: GraphQLContext
  ) {
    const { email, displayName, deviceLabel } = input;
    const result = await this.platformAuthService.issueEmailOtp({
      email,
      displayName,
      deviceLabel,
      logger: context.logger,
      requestId: context.requestId,
      ipAddress: context.request.ip,
      userAgent: context.request.headers["user-agent"],
    });

    const deliveryHint = email.replace(/(^.).+(@.*$)/, (_, first: string, domain: string) => `${first}***${domain}`);

    const model = new EmailOtpChallengeModel();
    model.token = result.token;
    model.expiresAt = result.expiresAt;
    model.deliveryHint = deliveryHint;
    return model;
  }

  @AllowAnonymous()
  @RateLimit({ windowMs: 60_000, max: 10 })
  @Mutation(() => ViewerModel, { name: "verifyEmailOtp" })
  async verifyEmailOtp(
    @Args("input", { type: () => VerifyEmailOtpInputModel }) input: VerifyEmailOtpInputModel,
    @Context() context: GraphQLContext
  ) {
    const verification = await this.platformAuthService.verifyEmailOtp({
      ...input,
      logger: context.logger,
      requestId: context.requestId,
      ipAddress: context.request.ip,
      userAgent: context.request.headers["user-agent"],
      deviceLabel: input.deviceLabel,
      reply: context.reply
    });

    return ViewerModel.fromContext({ user: verification.user, session: verification.session });
  }

  @Roles("fan", "creator", "operator", "admin")
  @Query(() => [ViewerSessionModel], { name: "viewerSessions" })
  async viewerSessions(@Context() context: GraphQLContext) {
    if (!context.user) {
      throw new BadRequestException("Viewer is not authenticated");
    }

    const sessions = await this.platformAuthService.listSessionsForUser(context.user.id);
    return sessions.map((session) => ViewerSessionModel.fromSession(session));
  }

  @Roles("fan", "creator", "operator", "admin")
  @Mutation(() => ViewerModel, { name: "logoutSession" })
  async logoutSession(
    @Args("sessionId", { type: () => String }) sessionId: string,
    @Context() context: GraphQLContext
  ) {
    if (!context.user) {
      throw new BadRequestException("Viewer is not authenticated");
    }

    const isCurrentSession = context.session && context.session.id === sessionId;

    await this.platformAuthService.logoutCurrentSession({
      sessionId,
      userId: context.user.id,
      roles: context.user.roles,
      logger: context.logger,
      requestId: context.requestId,
      ipAddress: context.request.ip,
      userAgent: context.request.headers["user-agent"],
      reply: context.reply,
      reason: isCurrentSession ? "current_session" : "user_initiated",
    });

    const user = await this.platformAuthService.getUserById(context.user.id);
    const session = isCurrentSession ? null : context.session;
    return ViewerModel.fromContext({ user, session });
  }

  @Roles("fan", "creator", "operator", "admin")
  @Mutation(() => ViewerSessionModel, { name: "revokeSession" })
  async revokeSession(
    @Args("sessionId", { type: () => String }) sessionId: string,
    @Context() context: GraphQLContext
  ) {
    if (!context.user) {
      throw new BadRequestException("Viewer is not authenticated");
    }

    const session = await this.platformAuthService.revokeSession({
      sessionId,
      userId: context.user.id,
      roles: context.user.roles,
      logger: context.logger,
      requestId: context.requestId,
      ipAddress: context.request.ip,
      userAgent: context.request.headers["user-agent"],
      reason: context.session && context.session.id === sessionId ? "current_session" : "user_initiated",
    });

    if (!session) {
      throw new BadRequestException("Session not found");
    }

    return ViewerSessionModel.fromSession(session);
  }
}

import { Args, Context, Mutation, Query, Resolver } from "@nestjs/graphql";
import { BadRequestException } from "@nestjs/common";
import { AllowAnonymous, RateLimit, Roles } from "../auth/auth.decorators";
import type { GraphQLContext } from "../observability/graphql-context";
import { PlatformAuthService } from "./platform-auth.service";
import { ViewerModel } from "../models/viewer.model";
import { ViewerSessionModel } from "../models/viewer-session.model";
import { StartTikTokLoginInputModel } from "../models/start-tiktok-login.input";
import { CompleteTikTokLoginInputModel } from "../models/complete-tiktok-login.input";
import { TikTokLoginIntentModel } from "../models/tiktok-login-intent.model";
import { ViewerUserModel } from "../models/viewer-user.model";
import { UpdateViewerProfileInputModel } from "../models/update-viewer-profile.input";

@Resolver()
export class PlatformAuthResolver {
  constructor(private readonly platformAuthService: PlatformAuthService) {}

  @AllowAnonymous()
  @RateLimit({ windowMs: 60_000, max: 10 })
  @Mutation(() => TikTokLoginIntentModel, { name: "startTikTokLogin" })
  async startTikTokLogin(
    @Args("input", { type: () => StartTikTokLoginInputModel, nullable: true }) input: StartTikTokLoginInputModel | null,
    @Context() context: GraphQLContext
  ) {
    const result = await this.platformAuthService.createTikTokLoginIntent({
      scopes: input?.scopes,
      returnPath: input?.returnPath,
      redirectUri: input?.redirectUri,
      deviceLabel: input?.deviceLabel,
      logger: context.logger,
      requestId: context.requestId,
      ipAddress: context.request.ip,
      userAgent: context.request.headers["user-agent"],
    });

    const model = new TikTokLoginIntentModel();
    model.state = result.state;
    model.clientKey = result.clientKey;
    model.redirectUri = result.redirectUri;
    model.scopes = result.scopes;
    model.returnPath = result.returnPath ?? null;
    return model;
  }

  @AllowAnonymous()
  @RateLimit({ windowMs: 60_000, max: 10 })
  @Mutation(() => ViewerModel, { name: "completeTikTokLogin" })
  async completeTikTokLogin(
    @Args("input", { type: () => CompleteTikTokLoginInputModel }) input: CompleteTikTokLoginInputModel,
    @Context() context: GraphQLContext
  ) {
    const result = await this.platformAuthService.completeTikTokLogin({
      code: input.code,
      state: input.state,
      logger: context.logger,
      requestId: context.requestId,
      ipAddress: context.request.ip,
      userAgent: context.request.headers["user-agent"],
      reply: context.reply
    });

    return ViewerModel.fromContext({ user: result.user, session: result.session });
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

  @Roles("fan", "creator", "operator", "admin")
  @Mutation(() => ViewerUserModel, { name: "updateViewerProfile" })
  async updateViewerProfile(
    @Args("input", { type: () => UpdateViewerProfileInputModel }) input: UpdateViewerProfileInputModel,
    @Context() context: GraphQLContext
  ) {
    if (!context.user) {
      throw new BadRequestException("Viewer is not authenticated");
    }

    const user = await this.platformAuthService.updateViewerProfile({
      userId: context.user.id,
      actorRoles: context.user.roles,
      displayName: input.displayName,
      phone: input.phone,
      logger: context.logger,
      requestId: context.requestId,
      ipAddress: context.request.ip,
      userAgent: context.request.headers["user-agent"]
    });

    return ViewerUserModel.fromUser(user);
  }
}

import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual
} from "node:crypto";
import { URLSearchParams } from "node:url";
import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { FastifyReply } from "fastify";
import type { Model } from "mongoose";
import type { Logger } from "pino";
import type {
  AuditLogAction,
  AuditLogSeverity,
  Session,
  SessionStatus,
  User,
  UserPermission,
  UserRole
} from "@trendpot/types";
import { rolePermissions } from "@trendpot/types";
import type { AuditLogDocument } from "./schemas/audit-log.schema";
import { AuditLogEntity } from "./schemas/audit-log.schema";
import type { SessionDocument } from "./schemas/session.schema";
import { SessionEntity } from "./schemas/session.schema";
import type { UserDocument } from "./schemas/user.schema";
import { UserEntity } from "./schemas/user.schema";
import { RateLimitService } from "../auth/rate-limit.service";
import { AuthAuditService } from "../auth/auth-audit.service";
import { RedisService } from "../redis/redis.service";

const SESSION_TTL_HOURS = Number(process.env.AUTH_SESSION_TTL_HOURS ?? 24);
const REFRESH_TTL_DAYS = Number(process.env.AUTH_REFRESH_TTL_DAYS ?? 14);
const SESSION_COOKIE_NAME = process.env.AUTH_SESSION_COOKIE_NAME ?? "trendpot.sid";
const REFRESH_COOKIE_NAME = process.env.AUTH_REFRESH_COOKIE_NAME ?? "trendpot.refresh";
const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN;
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY ?? "";
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET ?? "";
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI ?? "";
const TIKTOK_TOKEN_ENDPOINT = process.env.TIKTOK_TOKEN_ENDPOINT ??
  "https://open-api.tiktok.com/oauth/access_token/";
const TIKTOK_PROFILE_ENDPOINT = process.env.TIKTOK_PROFILE_ENDPOINT ??
  "https://open-api.tiktok.com/user/info/";
const TIKTOK_STATE_TTL_SECONDS = Number(process.env.TIKTOK_STATE_TTL_SECONDS ?? 600);

interface RequestContextMetadata {
  logger: Logger;
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  deviceLabel?: string;
  reply?: FastifyReply;
}

interface TikTokLoginIntentParams extends RequestContextMetadata {
  scopes?: string[];
  returnPath?: string;
  redirectUri?: string;
}

interface TikTokLoginIntentResult {
  state: string;
  clientKey: string;
  redirectUri: string;
  scopes: string[];
  returnPath?: string;
}

interface TikTokLoginCompletionParams extends RequestContextMetadata {
  code: string;
  state: string;
}

interface TikTokLoginResult {
  session: Session;
  user: User;
  redirectPath?: string;
}

interface RevokeSessionParams extends RequestContextMetadata {
  sessionId: string;
  userId: string;
  roles: UserRole[];
  reply?: FastifyReply;
  reason?: string;
}

type SessionTokenPayload = {
  sessionId: string;
  userId: string;
  issuedAt: string;
};

type TikTokStateRecord = {
  redirectUri: string;
  scopes: string[];
  returnPath?: string;
  deviceLabel?: string;
};

type TikTokTokenExchange = {
  accessToken: string;
  refreshToken: string;
  openId: string;
  expiresIn: number;
  refreshExpiresIn: number;
  scope: string[];
};

type TikTokProfile = {
  displayName?: string;
  username?: string;
  avatarUrl?: string;
};

interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

const DEFAULT_TIKTOK_SCOPES = ["user.info.basic"];

@Injectable()
export class PlatformAuthService {
  private readonly sessionTokenSecret =
    process.env.AUTH_SESSION_TOKEN_SECRET ?? "trendpot-dev-session-token";
  private readonly refreshHashSecret = process.env.AUTH_REFRESH_HASH_SECRET ?? "trendpot-dev-refresh";
  private readonly tiktokEncryptionKey: Buffer;
  private readonly tiktokKeyId = process.env.TIKTOK_TOKEN_ENC_KEY_ID ?? "local-dev";

  constructor(
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(SessionEntity.name) private readonly sessionModel: Model<SessionDocument>,
    @InjectModel(AuditLogEntity.name) private readonly auditLogModel: Model<AuditLogDocument>,
    private readonly rateLimitService: RateLimitService,
    private readonly auditService: AuthAuditService,
    private readonly redisService: RedisService
  ) {
    const providedKey = process.env.TIKTOK_TOKEN_ENC_KEY;
    if (providedKey) {
      const buffer = Buffer.from(providedKey, "base64");
      if (buffer.length !== 32) {
        throw new Error("TIKTOK_TOKEN_ENC_KEY must be a 32-byte base64 string");
      }
      this.tiktokEncryptionKey = buffer;
    } else {
      this.tiktokEncryptionKey = createHash("sha256")
        .update(process.env.AUTH_SESSION_TOKEN_SECRET ?? "trendpot-dev-session-token")
        .digest();
    }
  }

  async createTikTokLoginIntent(params: TikTokLoginIntentParams): Promise<TikTokLoginIntentResult> {
    const { logger, requestId, ipAddress, scopes, returnPath, redirectUri, deviceLabel } = params;

    const normalizedScopes = Array.isArray(scopes) && scopes.length > 0 ? scopes : DEFAULT_TIKTOK_SCOPES;
    const resolvedRedirectUri = redirectUri ?? TIKTOK_REDIRECT_URI;

    if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET || !resolvedRedirectUri) {
      throw new BadRequestException("TikTok OAuth is not configured correctly");
    }

    const rateLimitIdentifier = `auth:tiktok:intent:${ipAddress ?? "unknown"}`;
    const rateResult = await this.rateLimitService.consume(rateLimitIdentifier, { windowMs: 60_000, max: 20 });

    if (!rateResult.allowed) {
      this.auditService.recordRateLimitViolation({
        requestId,
        operation: "createTikTokLoginIntent",
        reason: "rate_limited",
        logger,
        ipAddress,
        retryAt: rateResult.retryAt
      });
      throw new BadRequestException("Too many login attempts. Please try again later.");
    }

    const state = randomBytes(16).toString("hex");
    const redisKey = this.buildStateKey(state);
    const statePayload: TikTokStateRecord = {
      redirectUri: resolvedRedirectUri,
      scopes: normalizedScopes,
      returnPath,
      deviceLabel
    };

    const client = this.redisService.getClient();
    await client.set(redisKey, JSON.stringify(statePayload), "EX", TIKTOK_STATE_TTL_SECONDS);

    logger.info(
      {
        event: "auth.tiktok.intent_created",
        state,
        requestId,
        ipAddress,
        scopes: normalizedScopes
      },
      "Issued TikTok login intent"
    );

    return {
      state,
      clientKey: TIKTOK_CLIENT_KEY,
      redirectUri: resolvedRedirectUri,
      scopes: normalizedScopes,
      returnPath
    };
  }

  async completeTikTokLogin(params: TikTokLoginCompletionParams): Promise<TikTokLoginResult> {
    const { code, state, logger, requestId, ipAddress, userAgent, reply } = params;

    const client = this.redisService.getClient();
    const redisKey = this.buildStateKey(state);
    const serialized = await client.get(redisKey);

    if (!serialized) {
      this.auditService.recordAuthorizationFailure({
        requestId,
        operation: "completeTikTokLogin",
        reason: "state_not_found",
        logger,
        ipAddress
      });
      throw new UnauthorizedException("TikTok login session has expired. Please start again.");
    }

    await client.del(redisKey);
    const stateRecord = JSON.parse(serialized) as TikTokStateRecord;

    const tokenExchange = await this.exchangeTikTokCode({
      code,
      redirectUri: stateRecord.redirectUri,
      logger,
      requestId,
      ipAddress
    });

    const profile = await this.fetchTikTokProfile({
      accessToken: tokenExchange.accessToken,
      openId: tokenExchange.openId,
      logger,
      requestId,
      ipAddress
    });

    const user = await this.upsertTikTokUser({
      profile,
      tokenExchange,
      logger,
      requestId,
      ipAddress,
      userAgent
    });

    const session = await this.issueSession({
      user,
      logger,
      requestId,
      ipAddress,
      userAgent,
      deviceLabel: stateRecord.deviceLabel,
      reply,
      tiktokOpenId: tokenExchange.openId
    });

    await this.appendAuditLog({
      actorId: user.id,
      actorRoles: user.roles,
      action: "auth.login",
      severity: "info",
      requestId,
      ipAddress,
      userAgent,
      summary: `TikTok login completed for ${user.displayName}`
    });

    logger.info(
      {
        event: "auth.tiktok.login_complete",
        requestId,
        userId: user.id,
        sessionId: session.id,
        openId: tokenExchange.openId
      },
      "TikTok login complete"
    );

    return {
      session,
      user,
      redirectPath: stateRecord.returnPath
    };
  }

  async createGuestSession(params: {
    displayName?: string;
    deviceLabel?: string;
  } & RequestContextMetadata): Promise<TikTokLoginResult> {
    const { displayName, deviceLabel, logger, requestId, ipAddress, userAgent, reply } = params;

    const trimmed = typeof displayName === "string" ? displayName.trim() : "";
    const guestDisplayName = trimmed.length > 0 ? trimmed : `Guest ${randomInt(1000, 9999)}`;

    const user = await this.userModel.create({
      email: null,
      displayName: guestDisplayName,
      roles: ["fan"],
      status: "active",
      metadata: { authOrigin: "guest", guest: true },
      audit: { lastLoginAt: new Date() },
      tiktokScopes: []
    });

    const session = await this.issueSession({
      user,
      logger,
      requestId,
      ipAddress,
      userAgent,
      deviceLabel,
      reply,
      tiktokOpenId: undefined
    });

    await this.appendAuditLog({
      actorId: user.id,
      actorRoles: user.roles,
      action: "auth.session.issue",
      severity: "info",
      requestId,
      ipAddress,
      userAgent,
      summary: `Bootstrapped guest session ${session.id}`
    });

    logger.info(
      {
        event: "auth.session.guest_issued",
        sessionId: session.id,
        userId: user.id,
        requestId,
        ipAddress
      },
      "Guest session issued"
    );

    return {
      session,
      user: this.mapUserDocument(user)
    };
  }

  private buildStateKey(state: string) {
    return `tiktok:state:${state}`;
  }

  private async exchangeTikTokCode(params: {
    code: string;
    redirectUri: string;
    logger: Logger;
    requestId: string;
    ipAddress?: string;
  }): Promise<TikTokTokenExchange> {
    const { code, redirectUri, logger, requestId, ipAddress } = params;

    const body = new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    });

    const response = await fetch(TIKTOK_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      logger.error(
        {
          event: "auth.tiktok.token_exchange_failed",
          status: response.status,
          requestId,
          ipAddress
        },
        "TikTok token exchange failed"
      );
      throw new UnauthorizedException("TikTok authorization failed");
    }

    const payload = (await response.json()) as {
      data?: {
        access_token: string;
        refresh_token: string;
        scope: string;
        expires_in: number;
        refresh_expires_in: number;
        open_id: string;
      };
      error?: string;
      message?: string;
    };

    if (!payload?.data || payload.error) {
      logger.error(
        {
          event: "auth.tiktok.token_exchange_error",
          requestId,
          ipAddress,
          error: payload?.error,
          message: payload?.message
        },
        "TikTok token exchange returned error"
      );
      throw new UnauthorizedException("TikTok authorization failed");
    }

    const scopes = payload.data.scope ? payload.data.scope.split(",").map((scope) => scope.trim()) : [];

    return {
      accessToken: payload.data.access_token,
      refreshToken: payload.data.refresh_token,
      openId: payload.data.open_id,
      expiresIn: payload.data.expires_in,
      refreshExpiresIn: payload.data.refresh_expires_in,
      scope: scopes
    };
  }

  private async fetchTikTokProfile(params: {
    accessToken: string;
    openId: string;
    logger: Logger;
    requestId: string;
    ipAddress?: string;
  }): Promise<TikTokProfile> {
    const { accessToken, openId, logger, requestId, ipAddress } = params;

    try {
      const response = await fetch(TIKTOK_PROFILE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          open_id: openId,
          fields: ["display_name", "avatar_url", "username"]
        })
      });

      if (!response.ok) {
        logger.warn(
          {
            event: "auth.tiktok.profile_fetch_failed",
            status: response.status,
            requestId,
            ipAddress
          },
          "Failed to fetch TikTok profile"
        );
        return {};
      }

      const payload = (await response.json()) as {
        data?: {
          user?: {
            display_name?: string;
            avatar_url?: string;
            username?: string;
          };
        };
      };

      return {
        displayName: payload?.data?.user?.display_name,
        avatarUrl: payload?.data?.user?.avatar_url,
        username: payload?.data?.user?.username
      };
    } catch (error) {
      logger.error({ event: "auth.tiktok.profile_fetch_error", error, requestId }, "TikTok profile fetch error");
      return {};
    }
  }

  private encryptSecret(plaintext: string): EncryptedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.tiktokEncryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64")
    };
  }

  private async upsertTikTokUser(params: {
    profile: TikTokProfile;
    tokenExchange: TikTokTokenExchange;
    logger: Logger;
    requestId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<UserDocument> {
    const { profile, tokenExchange, logger, requestId, ipAddress, userAgent } = params;

    const now = new Date();
    const encryptedAccess = this.encryptSecret(tokenExchange.accessToken);
    const encryptedRefresh = this.encryptSecret(tokenExchange.refreshToken);

    const update = {
      displayName: profile.displayName ?? "TikTok User",
      avatarUrl: profile.avatarUrl ?? undefined,
      tiktokUsername: profile.username ?? undefined,
      tiktokUserId: tokenExchange.openId,
      tiktokScopes: tokenExchange.scope,
      status: "active" as const,
      metadata: {
        authOrigin: "tiktok",
        guest: false
      },
      audit: {
        lastLoginAt: now
      },
      tiktokAuth: {
        keyId: this.tiktokKeyId,
        accessToken: encryptedAccess.ciphertext,
        accessTokenIv: encryptedAccess.iv,
        accessTokenTag: encryptedAccess.authTag,
        refreshToken: encryptedRefresh.ciphertext,
        refreshTokenIv: encryptedRefresh.iv,
        refreshTokenTag: encryptedRefresh.authTag,
        accessTokenExpiresAt: new Date(Date.now() + tokenExchange.expiresIn * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + tokenExchange.refreshExpiresIn * 1000),
        scope: tokenExchange.scope
      }
    };

    let user = await this.userModel.findOne({ tiktokUserId: tokenExchange.openId }).exec();

    if (user) {
      await this.userModel
        .updateOne(
          { _id: user._id },
          {
            $set: {
              displayName: update.displayName,
              avatarUrl: update.avatarUrl,
              tiktokUsername: update.tiktokUsername,
              tiktokScopes: update.tiktokScopes,
              status: update.status,
              metadata: update.metadata,
              "audit.lastLoginAt": now,
              tiktokAuth: update.tiktokAuth
            }
          }
        )
        .exec();

      user = await this.userModel.findById(user._id).exec();
      if (!user) {
        throw new UnauthorizedException("Failed to load account after TikTok login");
      }
      return user;
    }

    user = await this.userModel.create({
      email: null,
      displayName: update.displayName,
      avatarUrl: update.avatarUrl,
      tiktokUsername: update.tiktokUsername,
      tiktokUserId: tokenExchange.openId,
      tiktokScopes: tokenExchange.scope,
      roles: ["fan"],
      status: "active",
      metadata: update.metadata,
      audit: { lastLoginAt: now },
      tiktokAuth: update.tiktokAuth
    });

    await this.appendAuditLog({
      actorId: user.id,
      actorRoles: user.roles,
      action: "auth.session.issue",
      severity: "info",
      requestId,
      ipAddress,
      userAgent,
      summary: `Created new user via TikTok login (${tokenExchange.openId})`
    });

    logger.info(
      {
        event: "auth.tiktok.user_created",
        requestId,
        userId: user.id,
        openId: tokenExchange.openId
      },
      "Created user from TikTok profile"
    );

    return user;
  }

  private signSessionToken(payload: SessionTokenPayload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", this.sessionTokenSecret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash("sha256")
      .update(`${refreshToken}:${this.refreshHashSecret}`)
      .digest("hex");
  }

  private verifySessionToken(token: string): SessionTokenPayload | null {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) {
      return null;
    }

    const expectedSignature = createHmac("sha256", this.sessionTokenSecret)
      .update(encoded)
      .digest("base64url");

    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return null;
    }

    try {
      const decoded = Buffer.from(encoded, "base64url").toString("utf8");
      const payload = JSON.parse(decoded) as SessionTokenPayload;
      return payload;
    } catch {
      return null;
    }
  }

  async resolveSessionFromTokens(params: {
    sessionToken: string;
    refreshToken?: string | null;
    logger: Logger;
    requestId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ session: Session | null; user: User | null }> {
    const { sessionToken, refreshToken, logger, requestId, ipAddress, userAgent } = params;

    const payload = this.verifySessionToken(sessionToken);

    if (!payload) {
      logger.debug(
        { event: "auth.session.token_invalid", requestId, ipAddress, userAgent },
        "Rejected session token with invalid signature"
      );
      return { session: null, user: null };
    }

    const sessionDoc = await this.sessionModel
      .findOne({ _id: payload.sessionId, userId: payload.userId })
      .exec();

    if (!sessionDoc) {
      logger.debug(
        { event: "auth.session.not_found", sessionId: payload.sessionId, requestId, ipAddress, userAgent },
        "No matching session found for supplied token"
      );
      return { session: null, user: null };
    }

    if (sessionDoc.status !== "active") {
      logger.debug(
        {
          event: "auth.session.inactive",
          sessionId: sessionDoc.id,
          status: sessionDoc.status,
          requestId,
          ipAddress,
          userAgent
        },
        "Session no longer active"
      );
      return { session: null, user: null };
    }

    if (sessionDoc.expiresAt.getTime() <= Date.now()) {
      sessionDoc.status = "expired";
      await sessionDoc.save();
      logger.debug(
        {
          event: "auth.session.expired",
          sessionId: sessionDoc.id,
          requestId,
          ipAddress,
          userAgent
        },
        "Session expired"
      );
      return { session: null, user: null };
    }

    if (refreshToken) {
      const expectedHash = this.hashRefreshToken(refreshToken);
      if (expectedHash !== sessionDoc.refreshTokenHash) {
        logger.warn(
          {
            event: "auth.session.refresh_mismatch",
            sessionId: sessionDoc.id,
            requestId,
            ipAddress,
            userAgent
          },
          "Refresh token mismatch"
        );
        return { session: null, user: null };
      }
    }

    const userDoc = await this.userModel.findById(sessionDoc.userId).exec();

    if (!userDoc) {
      logger.debug(
        { event: "auth.session.user_missing", sessionId: sessionDoc.id, requestId, ipAddress, userAgent },
        "User linked to session no longer exists"
      );
      return { session: null, user: null };
    }

    if (userDoc.status === "disabled") {
      logger.debug(
        { event: "auth.session.user_disabled", sessionId: sessionDoc.id, requestId, ipAddress, userAgent },
        "User linked to session is disabled"
      );
      return { session: null, user: null };
    }

    return {
      session: this.mapSessionDocument(sessionDoc),
      user: this.mapUserDocument(userDoc)
    };
  }

  private async issueSession(params: {
    user: UserDocument;
    logger: Logger;
    requestId: string;
    ipAddress?: string;
    userAgent?: string;
    deviceLabel?: string;
    reply?: FastifyReply;
    tiktokOpenId?: string;
  }): Promise<Session> {
    const { user, logger, requestId, ipAddress, userAgent, deviceLabel, reply, tiktokOpenId } = params;

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + SESSION_TTL_HOURS * 3_600_000);
    const refreshExpiresAt = new Date(issuedAt.getTime() + REFRESH_TTL_DAYS * 86_400_000);

    const refreshToken = randomBytes(48).toString("base64url");
    const refreshTokenHash = this.hashRefreshToken(refreshToken);

    const sessionDoc = await this.sessionModel.create({
      userId: user._id,
      rolesSnapshot: [...user.roles],
      issuedAt,
      expiresAt,
      refreshTokenHash,
      ipAddress,
      userAgent,
      status: "active",
      metadata: {
        device: deviceLabel,
        riskLevel: "low",
        tiktokOpenId: tiktokOpenId ?? undefined
      }
    });

    const sessionToken = this.signSessionToken({
      sessionId: sessionDoc.id,
      userId: user.id,
      issuedAt: issuedAt.toISOString()
    });

    if (reply) {
      const secure = process.env.NODE_ENV === "production";
      const baseCookieOptions = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure,
        domain: COOKIE_DOMAIN,
        path: "/",
        expires: expiresAt
      };

      reply.setCookie(SESSION_COOKIE_NAME, sessionToken, baseCookieOptions);

      reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
        ...baseCookieOptions,
        sameSite: "strict",
        expires: refreshExpiresAt,
        path: "/auth/refresh"
      });
    }

    logger.debug(
      {
        event: "auth.session.cookies_set",
        sessionId: sessionDoc.id,
        requestId,
        hasReply: Boolean(reply)
      },
      "Session and refresh cookies prepared"
    );
    return this.mapSessionDocument(sessionDoc);
  }

  async listSessionsForUser(userId: string): Promise<Session[]> {
    const sessions = await this.sessionModel
      .find({ userId })
      .sort({ issuedAt: -1 })
      .limit(Number(process.env.AUTH_SESSION_HISTORY_LIMIT ?? 20))
      .exec();

    return sessions.map((doc) => this.mapSessionDocument(doc));
  }

  async revokeSession(params: RevokeSessionParams): Promise<Session | null> {
    const { sessionId, userId, logger, requestId, ipAddress, userAgent, reply, reason = "user_revocation", roles } = params;

    const sessionDoc = await this.sessionModel.findOne({ _id: sessionId, userId }).exec();

    if (!sessionDoc) {
      logger.warn(
        {
          event: "auth.session.revoke_missing",
          sessionId,
          userId,
          requestId
        },
        "Attempted to revoke a session that does not exist or does not belong to the user"
      );
      return null;
    }

    if (sessionDoc.status === "revoked") {
      return this.mapSessionDocument(sessionDoc);
    }

    sessionDoc.status = "revoked";
    sessionDoc.expiresAt = new Date();
    await sessionDoc.save();

    if (reply) {
      this.clearSessionCookies(reply);
    }

    await this.appendAuditLog({
      actorId: userId,
      actorRoles: roles,
      action: "auth.session.revoke",
      severity: "info",
      requestId,
      ipAddress,
      userAgent,
      targetId: sessionId,
      summary: `Revoked session ${sessionId} (${reason})`
    });

    logger.info(
      {
        event: "auth.session.revoked",
        sessionId,
        userId,
        requestId,
        reason
      },
      "Session revoked"
    );

    return this.mapSessionDocument(sessionDoc);
  }

  async logoutCurrentSession(params: RevokeSessionParams): Promise<Session | null> {
    return this.revokeSession(params);
  }

  async updateViewerProfile(params: {
    userId: string;
    actorRoles: UserRole[];
    displayName?: string;
    phone?: string;
    logger: Logger;
    requestId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<User> {
    const { userId, actorRoles, displayName, phone, logger, requestId, ipAddress, userAgent } = params;

    const updates: Record<string, unknown> = {};

    if (typeof displayName === "string") {
      const trimmed = displayName.trim();
      if (trimmed.length < 2) {
        throw new BadRequestException("Display name must be at least 2 characters long.");
      }
      updates.displayName = trimmed;
    }

    if (typeof phone === "string") {
      const normalized = phone.replace(/\s+/g, "");
      if (!/^\+?[0-9]{7,15}$/.test(normalized)) {
        throw new BadRequestException("Enter a valid phone number using international format.");
      }
      updates.phone = normalized;
      updates["metadata.guest"] = false;
    }

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException("Provide a display name or phone number to update.");
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(userId, { $set: updates }, { new: true })
      .exec();

    if (!updatedUser) {
      throw new BadRequestException("Unable to update profile because the account no longer exists.");
    }

    await this.appendAuditLog({
      actorId: userId,
      actorRoles,
      action: "auth.profile.update",
      severity: "info",
      requestId,
      ipAddress,
      userAgent,
      summary: "Updated profile details (display name / phone)"
    });

    logger.info(
      {
        event: "auth.profile.updated",
        userId,
        requestId,
        updatedFields: Object.keys(updates)
      },
      "User profile updated"
    );

    return this.mapUserDocument(updatedUser);
  }

  async getUserById(userId: string): Promise<User | null> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      return null;
    }
    return this.mapUserDocument(user);
  }

  private async appendAuditLog(params: {
    actorId?: string;
    actorRoles: UserRole[];
    action: AuditLogAction;
    severity: AuditLogSeverity;
    requestId?: string;
    ipAddress?: string;
    userAgent?: string;
    summary?: string;
    targetId?: string;
  }) {
    const { actorId, actorRoles, action, severity, requestId, ipAddress, userAgent, summary, targetId } = params;

    await this.auditLogModel.create({
      actorId,
      actorRoles,
      action,
      severity,
      targetId,
      context: {
        requestId,
        ipAddress,
        userAgent,
        summary
      }
    });
  }

  private clearSessionCookies(reply: FastifyReply) {
    const secure = process.env.NODE_ENV === "production";
    const baseOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure,
      domain: COOKIE_DOMAIN,
      path: "/"
    };

    reply.clearCookie(SESSION_COOKIE_NAME, baseOptions);
    reply.clearCookie(REFRESH_COOKIE_NAME, {
      ...baseOptions,
      sameSite: "strict",
      path: "/auth/refresh"
    });
  }

  private mapSessionDocument(sessionDoc: SessionDocument): Session {
    const rawId = (sessionDoc as SessionDocument & { _id: { toString(): string } })._id;
    const id = typeof sessionDoc.id === "string" && sessionDoc.id.length > 0 ? sessionDoc.id : rawId.toString();

    return {
      id,
      userId: String(sessionDoc.userId),
      rolesSnapshot: sessionDoc.rolesSnapshot as UserRole[],
      issuedAt: sessionDoc.issuedAt.toISOString(),
      expiresAt: sessionDoc.expiresAt.toISOString(),
      refreshTokenHash: sessionDoc.refreshTokenHash,
      ipAddress: sessionDoc.ipAddress,
      userAgent: sessionDoc.userAgent,
      status: sessionDoc.status as SessionStatus,
      metadata: {
        device: sessionDoc.metadata?.device,
        riskLevel: sessionDoc.metadata?.riskLevel,
        tiktokOpenId: (sessionDoc.metadata as { tiktokOpenId?: string } | undefined)?.tiktokOpenId
      }
    };
  }

  private mapUserDocument(user: UserDocument): User {
    const roles = [...user.roles] as UserRole[];
    const permissions = new Set<UserPermission>();

    for (const role of roles) {
      const rolePerms = rolePermissions[role] ?? [];
      for (const perm of rolePerms) {
        permissions.add(perm);
      }
    }

    return {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone,
      roles,
      permissions: Array.from(permissions),
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      tiktokUserId: user.tiktokUserId,
      tiktokUsername: user.tiktokUsername,
      tiktokScopes: Array.isArray(user.tiktokScopes) ? [...user.tiktokScopes] : [],
      status: user.status,
      createdAt: user.createdAt?.toISOString?.() ?? new Date().toISOString(),
      updatedAt: user.updatedAt?.toISOString?.() ?? new Date().toISOString(),
      metadata: (user.metadata as Record<string, unknown> | undefined) ?? undefined
    };
  }
}

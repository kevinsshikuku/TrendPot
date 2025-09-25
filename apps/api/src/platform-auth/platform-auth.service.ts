import { randomBytes, randomInt, timingSafeEqual, createHmac, createHash } from "node:crypto";
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
  UserRole
} from "@trendpot/types";
import { AuthEmailService } from "./email.service";
import type { AuditLogDocument } from "./schemas/audit-log.schema";
import { AuditLogEntity } from "./schemas/audit-log.schema";
import type { AuthFactorDocument } from "./schemas/auth-factor.schema";
import { AuthFactorEntity } from "./schemas/auth-factor.schema";
import type { SessionDocument } from "./schemas/session.schema";
import { SessionEntity } from "./schemas/session.schema";
import type { UserDocument } from "./schemas/user.schema";
import { UserEntity } from "./schemas/user.schema";
import { RateLimitService } from "../auth/rate-limit.service";
import { AuthAuditService } from "../auth/auth-audit.service";

const OTP_WINDOW_MINUTES = Number(process.env.AUTH_OTP_WINDOW_MINUTES ?? 10);
const OTP_ATTEMPT_LIMIT = Number(process.env.AUTH_OTP_ATTEMPT_LIMIT ?? 5);
const SESSION_TTL_HOURS = Number(process.env.AUTH_SESSION_TTL_HOURS ?? 24);
const REFRESH_TTL_DAYS = Number(process.env.AUTH_REFRESH_TTL_DAYS ?? 14);
const SESSION_COOKIE_NAME = process.env.AUTH_SESSION_COOKIE_NAME ?? "trendpot.sid";
const REFRESH_COOKIE_NAME = process.env.AUTH_REFRESH_COOKIE_NAME ?? "trendpot.refresh";
const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN;

interface RequestContextMetadata {
  logger: Logger;
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  deviceLabel?: string;
  reply?: FastifyReply;
}

interface IssueOtpParams extends RequestContextMetadata {
  email: string;
  displayName?: string;
}

interface VerifyOtpParams extends RequestContextMetadata {
  email: string;
  otpCode: string;
  token: string;
}

type SessionTokenPayload = {
  sessionId: string;
  userId: string;
  issuedAt: string;
};

type OtpTokenPayload = {
  factorId: string;
  userId: string;
  expiresAt: number;
  nonce: string;
};

@Injectable()
export class PlatformAuthService {
  private readonly otpHashSecret = process.env.AUTH_OTP_HASH_SECRET ?? "trendpot-dev-otp-hash";
  private readonly otpTokenSecret = process.env.AUTH_OTP_TOKEN_SECRET ?? "trendpot-dev-otp-token";
  private readonly sessionTokenSecret =
    process.env.AUTH_SESSION_TOKEN_SECRET ?? "trendpot-dev-session-token";
  private readonly refreshHashSecret = process.env.AUTH_REFRESH_HASH_SECRET ?? "trendpot-dev-refresh";

  constructor(
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(AuthFactorEntity.name)
    private readonly authFactorModel: Model<AuthFactorDocument>,
    @InjectModel(SessionEntity.name) private readonly sessionModel: Model<SessionDocument>,
    @InjectModel(AuditLogEntity.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    private readonly emailService: AuthEmailService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditService: AuthAuditService
  ) {}

  async issueEmailOtp(params: IssueOtpParams) {
    const { email, displayName, logger, requestId, ipAddress, userAgent } = params;
    const normalizedEmail = email.trim().toLowerCase();

    const rateLimitKey = `auth:otp:${normalizedEmail}`;
    const { allowed, retryAt } = this.rateLimitService.consume(rateLimitKey, {
      windowMs: OTP_WINDOW_MINUTES * 60_000,
      max: Number(process.env.AUTH_OTP_MAX_REQUESTS ?? 5)
    });

    if (!allowed) {
      this.auditService.recordRateLimitViolation({
        requestId,
        operation: "issueEmailOtp",
        reason: "otp_rate_limited",
        logger,
        ipAddress,
        retryAt
      });
      throw new BadRequestException("Too many OTP requests. Please try again later.");
    }

    let user = await this.userModel.findOne({ email: normalizedEmail }).exec();

    if (!user) {
      user = await this.userModel.create({
        email: normalizedEmail,
        displayName: displayName ?? normalizedEmail.split("@")[0],
        roles: ["fan"],
        status: "pending_verification",
        metadata: {},
        audit: {}
      });

      await this.appendAuditLog({
        actorId: user.id,
        actorRoles: user.roles,
        action: "auth.factor.enroll",
        severity: "info",
        requestId,
        ipAddress,
        userAgent,
        summary: `Seeded user via OTP request for ${normalizedEmail}`
      });
    } else if (user.status === "disabled") {
      logger.warn(
        {
          event: "auth.email_otp.rejected",
          reason: "user_disabled",
          userId: user.id,
          requestId,
          ipAddress
        },
        "OTP request rejected because user is disabled"
      );
      throw new UnauthorizedException("Account is disabled. Please contact support.");
    }

    const otpCode = this.generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_WINDOW_MINUTES * 60_000);
    const secretHash = this.hashOtp(otpCode);

    const factor = await this.authFactorModel.create({
      userId: user._id,
      type: "email_otp",
      channel: "email",
      secretHash,
      attempts: 0,
      expiresAt,
      status: "active"
    });

    const token = this.signOtpToken({
      factorId: factor.id,
      userId: user.id,
      expiresAt: expiresAt.getTime(),
      nonce: randomBytes(16).toString("base64url")
    });

    await this.emailService.sendOtpEmail({
      email: normalizedEmail,
      otpCode,
      token,
      expiresAt,
      logger,
      requestId
    });

    await this.appendAuditLog({
      actorId: user.id,
      actorRoles: user.roles,
      action: "auth.factor.challenge",
      severity: "info",
      requestId,
      ipAddress,
      userAgent,
      summary: `Issued email OTP via transactional stub for ${normalizedEmail}`
    });

    await this.userModel
      .updateOne(
        { _id: user.id },
        {
          $set: {
            "audit.lastOtpAt": new Date(),
            "audit.lastOtpIpAddress": ipAddress,
            "audit.lastOtpUserAgent": userAgent
          }
        }
      )
      .exec();

    logger.info(
      {
        event: "auth.email_otp.issued",
        userId: user.id,
        factorId: factor.id,
        expiresAt: expiresAt.toISOString(),
        requestId,
        ipAddress
      },
      "Email OTP issued"
    );

    return { token, expiresAt };
  }

  async verifyEmailOtp(params: VerifyOtpParams) {
    const { email, otpCode, token, logger, requestId, ipAddress, userAgent, deviceLabel, reply } = params;
    const normalizedEmail = email.trim().toLowerCase();

    const payload = this.verifyOtpToken(token);

    if (!payload) {
      this.auditService.recordAuthorizationFailure({
        requestId,
        operation: "verifyEmailOtp",
        reason: "invalid_token",
        logger,
        ipAddress
      });
      throw new UnauthorizedException("Invalid or expired OTP token.");
    }

    if (payload.expiresAt < Date.now()) {
      await this.authFactorModel.updateOne({ _id: payload.factorId }, { status: "expired" }).exec();
      throw new UnauthorizedException("OTP has expired. Please request a new code.");
    }

    const factor = await this.authFactorModel.findById(payload.factorId).exec();

    if (!factor || factor.status !== "active") {
      throw new UnauthorizedException("OTP is no longer valid. Please request a new code.");
    }

    const user = await this.userModel.findOne({ _id: factor.userId, email: normalizedEmail }).exec();

    if (!user) {
      throw new UnauthorizedException("Account not found for provided OTP.");
    }

    if (factor.attempts >= OTP_ATTEMPT_LIMIT) {
      await this.authFactorModel
        .updateOne({ _id: factor.id }, { status: "revoked" })
        .exec();
      throw new UnauthorizedException("Too many invalid attempts. Please request a new code.");
    }

    const providedHash = this.hashOtp(otpCode);
    const storedHashBuffer = Buffer.from(factor.secretHash, "hex");
    const providedHashBuffer = Buffer.from(providedHash, "hex");

    if (
      storedHashBuffer.length !== providedHashBuffer.length ||
      !timingSafeEqual(storedHashBuffer, providedHashBuffer)
    ) {
      await this.authFactorModel
        .updateOne({ _id: factor.id }, { $inc: { attempts: 1 } })
        .exec();
      throw new UnauthorizedException("Invalid OTP code. Please try again.");
    }

    await this.authFactorModel
      .updateOne({ _id: factor.id }, { status: "consumed", attempts: factor.attempts + 1 })
      .exec();

    await this.userModel
      .updateOne(
        { _id: user.id },
        {
          $set: {
            status: "active",
            "audit.lastLoginAt": new Date()
          }
        }
      )
      .exec();

    const session = await this.issueSession({
      user,
      logger,
      requestId,
      ipAddress,
      userAgent,
      deviceLabel,
      reply
    });

    await this.appendAuditLog({
      actorId: user.id,
      actorRoles: user.roles,
      action: "auth.session.issue",
      severity: "info",
      requestId,
      ipAddress,
      userAgent,
      summary: `Issued session ${session.id} for ${normalizedEmail}`
    });

    logger.info(
      {
        event: "auth.session.issued",
        sessionId: session.id,
        userId: user.id,
        requestId,
        expiresAt: session.expiresAt,
        ipAddress
      },
      "Session issued after OTP verification"
    );

    return session;
  }

  private generateOtpCode() {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
  }

  private hashOtp(otpCode: string) {
    return createHmac("sha256", this.otpHashSecret).update(otpCode).digest("hex");
  }

  private signOtpToken(payload: OtpTokenPayload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", this.otpTokenSecret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  private verifyOtpToken(token: string): OtpTokenPayload | null {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) {
      return null;
    }

    const expected = createHmac("sha256", this.otpTokenSecret).update(encoded).digest("base64url");

    const provided = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) {
      return null;
    }

    try {
      const decoded = Buffer.from(encoded, "base64url").toString("utf8");
      const payload = JSON.parse(decoded) as OtpTokenPayload;
      return payload;
    } catch {
      return null;
    }
  }

  private signSessionToken(payload: SessionTokenPayload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", this.sessionTokenSecret)
      .update(encoded)
      .digest("base64url");
    return `${encoded}.${signature}`;
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash("sha256")
      .update(`${refreshToken}:${this.refreshHashSecret}`)
      .digest("hex");
  }

  private async issueSession(params: {
    user: UserDocument;
    logger: Logger;
    requestId: string;
    ipAddress?: string;
    userAgent?: string;
    deviceLabel?: string;
    reply?: FastifyReply;
  }): Promise<Session> {
    const { user, logger, requestId, ipAddress, userAgent, deviceLabel, reply } = params;

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
        riskLevel: "low"
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

    const session: Session = {
      id: sessionDoc.id,
      userId: sessionDoc.userId.toString(),
      rolesSnapshot: sessionDoc.rolesSnapshot as UserRole[],
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      refreshTokenHash: refreshTokenHash,
      ipAddress,
      userAgent,
      status: sessionDoc.status as SessionStatus,
      metadata: sessionDoc.metadata
    };

    return session;
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
}

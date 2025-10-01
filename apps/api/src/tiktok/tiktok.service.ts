import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Logger } from "pino";
import { Types, type Model } from "mongoose";
import type { AuthenticatedUser } from "../auth/auth.types";
import { TikTokTokenService } from "../security/tiktok-token.service";
import { RateLimitService } from "../auth/rate-limit.service";
import type { UserDocument } from "../platform-auth/schemas/user.schema";
import { UserEntity } from "../platform-auth/schemas/user.schema";
import type { TikTokAccountDocument } from "../models/tiktok-account.schema";
import { TikTokAccountEntity } from "../models/tiktok-account.schema";
import type { VideoDocument } from "../models/video.schema";
import { VideoEntity } from "../models/video.schema";
import type { SubmissionDocument } from "../models/submission.schema";
import { SubmissionEntity } from "../models/submission.schema";
import { SubmissionState } from "../models/submission-state.enum";
import type { ChallengeDocument } from "../models/challenge.schema";
import { ChallengeEntity } from "../models/challenge.schema";
import type { AuditLogDocument } from "../platform-auth/schemas/audit-log.schema";
import { AuditLogEntity } from "../platform-auth/schemas/audit-log.schema";
import type { AuditLogAction, AuditLogSeverity } from "@trendpot/types";
import { tikTokEmbedSchema, type TikTokEmbed } from "@trendpot/types";

interface ListCreatorVideosParams {
  user: AuthenticatedUser;
  first?: number;
  after?: string;
  logger: Logger;
  requestId: string;
}

interface SubmitToChallengeParams {
  user: AuthenticatedUser;
  challengeId: string;
  tiktokVideoId: string;
  logger: Logger;
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

interface TikTokDisplayVideo {
  id: string;
  create_time?: number;
  description?: string;
  embed_html?: string;
  share_url?: string;
  cover_image_url?: string;
  author?: {
    open_id?: string;
    display_name?: string;
    avatar_url?: string;
    username?: string;
  };
  video?: {
    cover_image_url?: string;
  };
  stats?: {
    digg_count?: number;
    comment_count?: number;
    share_count?: number;
    play_count?: number;
    view_count?: number;
  };
}

interface TikTokDisplayListResponse {
  data?: {
    videos?: TikTokDisplayVideo[];
    cursor?: string;
    has_more?: boolean;
  };
  error?: {
    code?: number;
    message?: string;
    log_id?: string;
  };
}

interface TikTokDisplayVideoDataResponse {
  data?: {
    videos?: TikTokDisplayVideo[];
    metrics?: Array<{
      id: string;
      stats?: TikTokDisplayVideo["stats"];
    }>;
  };
  error?: TikTokDisplayListResponse["error"];
}

interface VideoConnectionResult {
  edges: Array<{ cursor: string; node: Record<string, unknown> }>;
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
}

const DISPLAY_API_BASE_URL = process.env.TIKTOK_DISPLAY_API_BASE_URL ?? "https://open-api.tiktok.com";
const TOKEN_REFRESH_ENDPOINT = process.env.TIKTOK_TOKEN_ENDPOINT ??
  "https://open-api.tiktok.com/oauth/refresh_token/";
const DISPLAY_VIDEO_LIST_PATH = "/v2/video/list/";
const DISPLAY_VIDEO_DATA_PATH = "/v2/video/data/";
const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY ?? "";
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET ?? "";
const PAGE_SIZE = Number(process.env.TIKTOK_INGESTION_PAGE_SIZE ?? 20);
const RATE_LIMIT_PER_MIN = Number(process.env.TIKTOK_INGESTION_RATE_LIMIT_PER_MIN ?? 90);

@Injectable()
export class TikTokDisplayService {
  constructor(
    @InjectModel(UserEntity.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(TikTokAccountEntity.name) private readonly accountModel: Model<TikTokAccountDocument>,
    @InjectModel(VideoEntity.name) private readonly videoModel: Model<VideoDocument>,
    @InjectModel(SubmissionEntity.name) private readonly submissionModel: Model<SubmissionDocument>,
    @InjectModel(ChallengeEntity.name) private readonly challengeModel: Model<ChallengeDocument>,
    @InjectModel(AuditLogEntity.name) private readonly auditLogModel: Model<AuditLogDocument>,
    private readonly tokenService: TikTokTokenService,
    private readonly rateLimitService: RateLimitService
  ) {}

  async listCreatorVideos(params: ListCreatorVideosParams): Promise<VideoConnectionResult> {
    const { user, first, after, logger, requestId } = params;
    const account = await this.resolveCreatorAccount(user, logger, requestId);
    const accessToken = await this.ensureValidAccessToken(account, logger, requestId);

    const limit = sanitizePageSize(first);
    const cursor = decodeVideoCursor(after);

    const response = await this.callDisplayApi<TikTokDisplayListResponse>(
      DISPLAY_VIDEO_LIST_PATH,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          cursor: null,
          max_count: limit
        })
      },
      { rateLimitKey: "video_list", logger, requestId }
    );

    const videos = response.data?.videos ?? [];
    await Promise.all(
      videos.map((video) => this.upsertVideoFromDisplay(account, video, logger, requestId))
    );

    await this.accountModel
      .updateOne(
        { _id: account._id },
        { $set: { "syncMetadata.lastVideoSyncAt": new Date() } }
      )
      .exec();

    const connection = await this.buildVideoConnection(account._id, limit, cursor);

    await this.recordAuditLog({
      user,
      action: "tiktok.video.list",
      logger,
      requestId,
      summary: `Fetched ${videos.length} TikTok videos for review.`
    });

    return connection;
  }

  async submitToChallenge(params: SubmitToChallengeParams) {
    const { user, challengeId, tiktokVideoId, logger, requestId, ipAddress, userAgent } = params;
    const account = await this.resolveCreatorAccount(user, logger, requestId);
    const videoDoc = await this.ensureVideoAvailable(account, tiktokVideoId, logger, requestId);

    const slug = normalizeChallengeId(challengeId);
    if (!slug) {
      throw new BadRequestException("A valid challenge id is required.");
    }

    const challenge = await this.challengeModel.findOne({ slug }).exec();
    if (!challenge) {
      throw new BadRequestException("Challenge not found.");
    }

    const creatorUserId = new Types.ObjectId(user.id);
    const existing = await this.submissionModel
      .findOne({
        challengeId: challenge._id,
        creatorUserId,
        videoId: videoDoc._id
      })
      .exec();

    if (existing) {
      return this.hydrateSubmission(existing._id, logger, requestId);
    }

    const submission = await this.submissionModel.create({
      challengeId: challenge._id,
      creatorUserId,
      videoId: videoDoc._id,
      state: SubmissionState.Pending
    });

    await this.recordAuditLog({
      user,
      action: "tiktok.submission.create",
      logger,
      requestId,
      ipAddress,
      userAgent,
      targetId: String(challenge._id),
      summary: `Submitted TikTok video ${tiktokVideoId} to challenge ${slug}.`
    });

    return this.hydrateSubmission(submission._id, logger, requestId);
  }

  async fetchVideoMetrics(params: {
    user: AuthenticatedUser;
    tiktokVideoId: string;
    logger: Logger;
    requestId: string;
  }) {
    const { user, tiktokVideoId, logger, requestId } = params;
    const account = await this.resolveCreatorAccount(user, logger, requestId);
    const accessToken = await this.ensureValidAccessToken(account, logger, requestId);

    const response = await this.callDisplayApi<TikTokDisplayVideoDataResponse>(
      DISPLAY_VIDEO_DATA_PATH,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          video_ids: [tiktokVideoId]
        })
      },
      { rateLimitKey: "video_metrics", logger, requestId }
    );

    const metrics = response.data?.metrics?.find((entry) => entry.id === tiktokVideoId)?.stats ?? {};

    await this.accountModel
      .updateOne(
        { _id: account._id },
        {
          $set: {
            "syncMetadata.lastMetricsRefreshAt": new Date(),
            "syncMetadata.lastMetricsErrorAt": null
          }
        }
      )
      .exec();

    return sanitizeMetrics(metrics);
  }

  private async resolveCreatorAccount(
    user: AuthenticatedUser,
    logger: Logger,
    requestId: string
  ): Promise<TikTokAccountDocument> {
    if (!user.tiktokUserId) {
      logger.warn({ event: "tiktok.account.missing", requestId, userId: user.id }, "User is not linked to TikTok");
      throw new UnauthorizedException("Your account is not linked to TikTok.");
    }

    const account = await this.accountModel.findOne({ openId: user.tiktokUserId }).exec();

    if (!account) {
      logger.warn({ event: "tiktok.account.not_found", requestId, userId: user.id }, "TikTok account record missing");
      throw new UnauthorizedException("TikTok account not found. Please re-link your account.");
    }

    return account;
  }

  private async ensureValidAccessToken(
    account: TikTokAccountDocument,
    logger: Logger,
    requestId: string
  ): Promise<string> {
    const { accessToken, refreshToken, keyId } = this.decryptAccountTokens(account);
    const expiresAt = account.accessTokenExpiresAt?.getTime() ?? 0;

    if (expiresAt > Date.now() + 60_000) {
      return accessToken;
    }

    logger.info({ event: "tiktok.token.refresh", requestId, accountId: account.id }, "Refreshing TikTok access token");

    await this.refreshAccessToken({
      account,
      refreshToken,
      logger,
      requestId
    });

    return this.tokenService.decryptAccountToken(account.accessToken, account.accessToken.keyId);
  }

  private decryptAccountTokens(account: TikTokAccountDocument) {
    const keyId = account.accessToken.keyId;
    const accessToken = this.tokenService.decryptAccountToken(account.accessToken, keyId);
    const refreshToken = this.tokenService.decryptAccountToken(account.refreshToken, keyId);

    return { accessToken, refreshToken, keyId };
  }

  private async refreshAccessToken(params: {
    account: TikTokAccountDocument;
    refreshToken: string;
    logger: Logger;
    requestId: string;
  }): Promise<void> {
    const { account, refreshToken, logger, requestId } = params;

    if (!CLIENT_KEY || !CLIENT_SECRET) {
      throw new UnauthorizedException("TikTok Display API credentials are not configured.");
    }

    const response = await fetch(TOKEN_REFRESH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_key: CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      const errorBody = await safeParseJson(response);
      logger.error(
        { event: "tiktok.token.refresh_failed", status: response.status, body: errorBody, requestId },
        "TikTok token refresh failed"
      );
      throw new UnauthorizedException("Unable to refresh TikTok credentials. Please re-link your account.");
    }

    const payload = (await response.json()) as {
      data?: {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        refresh_expires_in?: number;
      };
    };

    const data = payload.data;
    if (!data?.access_token || !data.refresh_token || !data.expires_in || !data.refresh_expires_in) {
      logger.error({ event: "tiktok.token.refresh_payload_invalid", payload, requestId }, "Unexpected TikTok refresh payload");
      throw new UnauthorizedException("TikTok did not return new credentials.");
    }

    const encryptedAccess = this.tokenService.encrypt(data.access_token);
    const encryptedRefresh = this.tokenService.encrypt(data.refresh_token);

    const accessTokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);
    const refreshTokenExpiresAt = new Date(Date.now() + data.refresh_expires_in * 1000);

    await this.accountModel
      .updateOne(
        { _id: account._id },
        {
          $set: {
            accessToken: {
              keyId: this.tokenService.keyId,
              ciphertext: encryptedAccess.ciphertext,
              iv: encryptedAccess.iv,
              authTag: encryptedAccess.authTag
            },
            refreshToken: {
              keyId: this.tokenService.keyId,
              ciphertext: encryptedRefresh.ciphertext,
              iv: encryptedRefresh.iv,
              authTag: encryptedRefresh.authTag
            },
            accessTokenExpiresAt,
            refreshTokenExpiresAt
          }
        }
      )
      .exec();

    account.accessToken = {
      keyId: this.tokenService.keyId,
      ciphertext: encryptedAccess.ciphertext,
      iv: encryptedAccess.iv,
      authTag: encryptedAccess.authTag
    } as TikTokAccountDocument["accessToken"];
    account.refreshToken = {
      keyId: this.tokenService.keyId,
      ciphertext: encryptedRefresh.ciphertext,
      iv: encryptedRefresh.iv,
      authTag: encryptedRefresh.authTag
    } as TikTokAccountDocument["refreshToken"];
    account.accessTokenExpiresAt = accessTokenExpiresAt;
    account.refreshTokenExpiresAt = refreshTokenExpiresAt;

    await this.userModel
      .updateOne(
        { _id: account.userId },
        {
          $set: {
            "tiktokAuth.keyId": this.tokenService.keyId,
            "tiktokAuth.accessToken": encryptedAccess.ciphertext,
            "tiktokAuth.accessTokenIv": encryptedAccess.iv,
            "tiktokAuth.accessTokenTag": encryptedAccess.authTag,
            "tiktokAuth.refreshToken": encryptedRefresh.ciphertext,
            "tiktokAuth.refreshTokenIv": encryptedRefresh.iv,
            "tiktokAuth.refreshTokenTag": encryptedRefresh.authTag,
            "tiktokAuth.accessTokenExpiresAt": accessTokenExpiresAt,
            "tiktokAuth.refreshTokenExpiresAt": refreshTokenExpiresAt
          }
        }
      )
      .exec();

    return;
  }

  private async ensureVideoAvailable(
    account: TikTokAccountDocument,
    tiktokVideoId: string,
    logger: Logger,
    requestId: string
  ): Promise<VideoDocument> {
    const existing = await this.videoModel.findOne({ tiktokVideoId }).exec();
    if (existing) {
      return existing;
    }

    const accessToken = await this.ensureValidAccessToken(account, logger, requestId);
    const response = await this.callDisplayApi<TikTokDisplayVideoDataResponse>(
      DISPLAY_VIDEO_DATA_PATH,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          video_ids: [tiktokVideoId]
        })
      },
      { rateLimitKey: "video_lookup", logger, requestId }
    );

    const metrics = response.data?.metrics?.find((entry) => entry.id === tiktokVideoId)?.stats;
    const video = (response.data?.videos ?? []).find((item) => item.id === tiktokVideoId);
    if (!video) {
      throw new BadRequestException("TikTok video could not be located.");
    }

    const normalizedVideo: TikTokDisplayVideo = {
      ...video,
      stats: metrics ?? video.stats
    };

    await this.upsertVideoFromDisplay(account, normalizedVideo, logger, requestId);

    const hydrated = await this.videoModel.findOne({ tiktokVideoId }).exec();
    if (!hydrated) {
      throw new BadRequestException("Failed to persist TikTok video. Please try again.");
    }

    return hydrated;
  }

  private async upsertVideoFromDisplay(
    account: TikTokAccountDocument,
    video: TikTokDisplayVideo,
    logger: Logger,
    requestId: string
  ) {
    if (!video.id) {
      return;
    }

    const shareUrl = video.share_url ?? buildShareUrl(video.id, account.username);
    const embed = buildEmbed(shareUrl, video.embed_html, video.author?.username);
    const sanitizedEmbed = tikTokEmbedSchema.parse(embed);

    const metrics = sanitizeMetrics(video.stats);
    const postedAt = video.create_time ? new Date(video.create_time * 1000) : undefined;

    await this.videoModel
      .findOneAndUpdate(
        { tiktokVideoId: video.id },
        {
          $set: {
            ownerTikTokAccountId: account._id,
            shareUrl,
            caption: sanitizeCaption(video.description),
            postedAt,
            embed: sanitizedEmbed,
            metrics,
            lastRefreshedAt: new Date()
          },
          $setOnInsert: {
            ownerTikTokAccountId: account._id
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      .exec();

    logger.debug({ event: "tiktok.video.upsert", requestId, videoId: video.id }, "Upserted TikTok video");
  }

  private async buildVideoConnection(
    accountId: Types.ObjectId,
    limit: number,
    cursor: ReturnType<typeof decodeVideoCursor>
  ): Promise<VideoConnectionResult> {
    const conditions: Record<string, unknown>[] = [{ ownerTikTokAccountId: accountId }];

    if (cursor) {
      conditions.push({
        $or: [
          { postedAt: { $lt: cursor.postedAt } },
          { postedAt: cursor.postedAt, _id: { $lt: cursor.id } }
        ]
      });
    }

    const query = conditions.length > 1 ? { $and: conditions } : conditions[0];

    const documents = await this.videoModel
      .find(query)
      .sort({ postedAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate({ path: "ownerTikTokAccountId", model: TikTokAccountEntity.name })
      .exec();

    const hasNextPage = documents.length > limit;
    const window = hasNextPage ? documents.slice(0, -1) : documents;

    const edges = window.map((doc) => {
      const owner = doc.ownerTikTokAccountId as unknown as TikTokAccountDocument;
      const node = toVideoNode(doc, owner);
      const edgeCursor = encodeVideoCursor(doc.postedAt ?? doc.createdAt ?? new Date(), doc._id);
      return { cursor: edgeCursor, node };
    });

    const endCursor = edges.length > 0 ? edges[edges.length - 1]?.cursor ?? null : null;

    return {
      edges,
      pageInfo: {
        endCursor,
        hasNextPage
      }
    };
  }

  private async hydrateSubmission(submissionId: Types.ObjectId, logger: Logger, requestId: string) {
    const submission = await this.submissionModel
      .findById(submissionId)
      .populate({
        path: "videoId",
        model: VideoEntity.name,
        populate: { path: "ownerTikTokAccountId", model: TikTokAccountEntity.name }
      })
      .exec();

    if (!submission) {
      throw new BadRequestException("Submission could not be loaded.");
    }

    const videoDoc = submission.videoId as unknown as VideoDocument;
    const owner = videoDoc.ownerTikTokAccountId as unknown as TikTokAccountDocument;
    const node = toVideoNode(videoDoc, owner);

    logger.info({ event: "tiktok.submission.hydrated", submissionId: submission.id, requestId }, "Hydrated submission payload");

    return {
      id: submission.id,
      challengeId: String(submission.challengeId),
      creatorUserId: String(submission.creatorUserId),
      videoId: videoDoc.id,
      state: submission.state,
      rejectionReason: submission.rejectionReason ?? null,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      video: node
    };
  }

  private async recordAuditLog(params: {
    user: AuthenticatedUser;
    action: AuditLogAction;
    logger: Logger;
    requestId: string;
    ipAddress?: string;
    userAgent?: string;
    summary?: string;
    targetId?: string;
    severity?: AuditLogSeverity;
  }) {
    const { user, action, logger, requestId, ipAddress, userAgent, summary, targetId, severity } = params;

    try {
      await this.auditLogModel.create({
        actorId: new Types.ObjectId(user.id),
        actorRoles: user.roles,
        action,
        targetId,
        context: {
          requestId,
          ipAddress,
          userAgent,
          summary
        },
        severity: severity ?? "info"
      });
    } catch (error) {
      logger.error({ event: "tiktok.audit.log_failed", error, requestId, action }, "Failed to persist audit log");
    }
  }

  private async callDisplayApi<T>(
    path: string,
    init: RequestInit,
    meta: { rateLimitKey: string; logger: Logger; requestId: string }
  ): Promise<T> {
    const { rateLimitKey, logger, requestId } = meta;
    const rateKey = `tiktok:display:${rateLimitKey}`;

    const rateResult = await this.rateLimitService.consume(rateKey, { windowMs: 60_000, max: RATE_LIMIT_PER_MIN });
    if (!rateResult.allowed) {
      logger.warn({ event: "tiktok.display.rate_limited", requestId, rateKey }, "Display API rate limit hit");
      throw new BadRequestException("TikTok Display API rate limit exceeded. Please try again soon.");
    }

    const url = new URL(path, DISPLAY_API_BASE_URL).toString();
    const response = await fetch(url, init);

    const body = await safeParseJson(response);

    if (!response.ok) {
      logger.error({ event: "tiktok.display.error", status: response.status, body, requestId }, "TikTok Display API error");
      throw new BadRequestException("TikTok Display API responded with an error.");
    }

    if (body?.error) {
      logger.error({ event: "tiktok.display.payload_error", payload: body, requestId }, "TikTok Display API returned an error payload");
      throw new BadRequestException(body.error.message ?? "TikTok Display API reported an error.");
    }

    return body as T;
  }
}

const sanitizePageSize = (first?: number): number => {
  if (typeof first !== "number" || !Number.isFinite(first) || first <= 0) {
    return Math.min(50, Math.max(1, PAGE_SIZE));
  }

  return Math.min(50, Math.floor(first));
};

const sanitizeCaption = (value?: string | null): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 2200);
};

const sanitizeMetrics = (stats: TikTokDisplayVideo["stats"] | undefined) => ({
  likeCount: Math.max(0, Math.trunc(stats?.digg_count ?? 0)),
  commentCount: Math.max(0, Math.trunc(stats?.comment_count ?? 0)),
  shareCount: Math.max(0, Math.trunc(stats?.share_count ?? 0)),
  viewCount: Math.max(0, Math.trunc(stats?.play_count ?? stats?.view_count ?? 0))
});

const buildShareUrl = (videoId: string, username?: string | null) => {
  if (username) {
    return `https://www.tiktok.com/@${username}/video/${videoId}`;
  }

  return `https://www.tiktok.com/@trendpot/video/${videoId}`;
};

const buildEmbed = (shareUrl: string, embedHtml?: string, username?: string | null): TikTokEmbed => {
  if (embedHtml) {
    return {
      provider: "tiktok",
      html: embedHtml,
      scriptUrl: "https://www.tiktok.com/embed.js",
      width: undefined,
      height: undefined,
      thumbnailUrl: undefined,
      authorName: username ?? undefined,
      authorUrl: username ? `https://www.tiktok.com/@${username}` : undefined
    };
  }

  const html = `<blockquote class="tiktok-embed" cite="${shareUrl}" data-video-id="${shareUrl}"></blockquote>`;

  return {
    provider: "tiktok",
    html,
    scriptUrl: "https://www.tiktok.com/embed.js",
    width: undefined,
    height: undefined,
    thumbnailUrl: undefined,
    authorName: username ?? undefined,
    authorUrl: username ? `https://www.tiktok.com/@${username}` : undefined
  };
};

const encodeVideoCursor = (postedAt: Date, id: Types.ObjectId): string => {
  return Buffer.from(`${postedAt.toISOString()}::${id.toHexString()}`).toString("base64");
};

const decodeVideoCursor = (cursor?: string): { postedAt: Date; id: Types.ObjectId } | null => {
  if (!cursor) {
    return null;
  }

  try {
    const raw = Buffer.from(cursor, "base64").toString("utf8");
    const [postedAtIso, idHex] = raw.split("::");
    const postedAt = new Date(postedAtIso);
    if (!postedAtIso || Number.isNaN(postedAt.getTime()) || !idHex) {
      return null;
    }

    return {
      postedAt,
      id: new Types.ObjectId(idHex)
    };
  } catch {
    return null;
  }
};

const normalizeChallengeId = (value: string): string => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const safeParseJson = async (response: Response): Promise<any> => {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
};

const toVideoNode = (video: VideoDocument, owner: TikTokAccountDocument) => ({
  id: video.id,
  tiktokVideoId: video.tiktokVideoId,
  ownerAccountId: owner.id,
  shareUrl: video.shareUrl,
  caption: video.caption ?? null,
  postedAt: video.postedAt ?? null,
  embed: video.embed,
  metrics: video.metrics,
  lastRefreshedAt: video.lastRefreshedAt,
  createdAt: video.createdAt,
  updatedAt: video.updatedAt,
  owner: {
    id: owner.id,
    username: owner.username,
    displayName: owner.displayName ?? null,
    avatarUrl: owner.avatarUrl ?? null,
    scopes: owner.scopes,
    accessTokenExpiresAt: owner.accessTokenExpiresAt,
    refreshTokenExpiresAt: owner.refreshTokenExpiresAt,
    createdAt: owner.createdAt,
    updatedAt: owner.updatedAt
  }
});


import { Job, Queue } from "bullmq";
import IORedis from "ioredis";
import { Types } from "mongoose";
import type { Logger } from "pino";
import {
  TIKTOK_VIDEO_UPDATE_CHANNEL,
  TikTokInitialSyncJob,
  TikTokMetricsRefreshJob,
  TIKTOK_REFRESH_QUEUE,
  tiktokInitialSyncJobSchema,
  tiktokMetricsRefreshJobSchema
} from "@trendpot/types";
import { TikTokTokenCipher, mapAccountTokenToEncryptedSecret } from "@trendpot/utils";
import { getMongoDb } from "../mongo";
import { workerLogger } from "../logger";
import {
  chunkArray,
  sanitizeDisplayMetrics,
  transformDisplayVideo,
  type TikTokDisplayVideo
} from "./transform";

const DISPLAY_API_BASE_URL = process.env.TIKTOK_DISPLAY_API_BASE_URL ?? "https://open-api.tiktok.com";
const TOKEN_REFRESH_ENDPOINT = process.env.TIKTOK_TOKEN_ENDPOINT ??
  "https://open-api.tiktok.com/oauth/refresh_token/";
const DISPLAY_VIDEO_LIST_PATH = "/v2/video/list/";
const DISPLAY_VIDEO_DATA_PATH = "/v2/video/data/";
const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY ?? "";
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET ?? "";
const PAGE_SIZE = Number(process.env.TIKTOK_INGESTION_PAGE_SIZE ?? 20);
const METRICS_BATCH_SIZE = Number(process.env.TIKTOK_INGESTION_METRICS_BATCH_SIZE ?? 20);
const REFRESH_INTERVAL_MS = Number(process.env.TIKTOK_METRICS_REFRESH_INTERVAL_MS ?? 15 * 60 * 1000);
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

interface TikTokAccountRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  openId: string;
  username: string;
  scopes: string[];
  accessToken: {
    keyId: string;
    ciphertext: string;
    iv: string;
    authTag: string;
  };
  refreshToken: {
    keyId: string;
    ciphertext: string;
    iv: string;
    authTag: string;
  };
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  syncMetadata?: {
    lastVideoSyncAt?: Date;
    lastProfileRefreshAt?: Date;
    lastMetricsRefreshAt?: Date;
    lastMetricsErrorAt?: Date;
  };
}

interface TikTokVideoMetricsResponse {
  data?: {
    metrics?: Array<{ id: string; stats?: TikTokDisplayVideo["stats"] }>;
  };
  error?: {
    code?: number;
    message?: string;
    log_id?: string;
  };
}

interface TikTokVideoListResponse {
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

const tokenCipher = new TikTokTokenCipher();

const safeParseJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const decryptAccountToken = (token: TikTokAccountRecord["accessToken"], keyId: string): string => {
  return tokenCipher.decrypt(mapAccountTokenToEncryptedSecret(token), { keyId });
};

const ensureValidAccessToken = async (
  account: TikTokAccountRecord,
  db: Awaited<ReturnType<typeof getMongoDb>>,
  logger: Logger,
  requestId?: string
): Promise<{ accessToken: string; account: TikTokAccountRecord }> => {
  const now = Date.now();
  const expiry = new Date(account.accessTokenExpiresAt).getTime();
  const accessToken = decryptAccountToken(account.accessToken, account.accessToken.keyId);

  if (expiry > now + TOKEN_EXPIRY_BUFFER_MS) {
    return { accessToken, account };
  }

  return refreshAccessToken(account, db, logger, requestId);
};

const refreshAccessToken = async (
  account: TikTokAccountRecord,
  db: Awaited<ReturnType<typeof getMongoDb>>,
  logger: Logger,
  requestId?: string
): Promise<{ accessToken: string; account: TikTokAccountRecord }> => {
  if (!CLIENT_KEY || !CLIENT_SECRET) {
    throw new Error("TikTok Display API credentials are not configured");
  }

  const refreshToken = decryptAccountToken(account.refreshToken, account.refreshToken.keyId);
  logger.info(
    { event: "tiktok.token.refresh", accountId: account._id.toHexString(), requestId },
    "Refreshing TikTok access token"
  );

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
      {
        event: "tiktok.token.refresh_failed",
        status: response.status,
        body: errorBody,
        requestId,
        accountId: account._id.toHexString()
      },
      "TikTok token refresh failed"
    );
    throw new Error("Unable to refresh TikTok credentials");
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
    logger.error(
      { event: "tiktok.token.refresh_payload_invalid", payload, requestId, accountId: account._id.toHexString() },
      "Unexpected TikTok refresh payload"
    );
    throw new Error("TikTok did not return refreshed credentials");
  }

  const encryptedAccess = tokenCipher.encrypt(data.access_token);
  const encryptedRefresh = tokenCipher.encrypt(data.refresh_token);
  const accessTokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);
  const refreshTokenExpiresAt = new Date(Date.now() + data.refresh_expires_in * 1000);
  const accounts = db.collection<TikTokAccountRecord>("tiktok_accounts");
  const users = db.collection("users");
  const now = new Date();

  await accounts.updateOne(
    { _id: account._id },
    {
      $set: {
        accessToken: {
          keyId: tokenCipher.keyId,
          ciphertext: encryptedAccess.ciphertext,
          iv: encryptedAccess.iv,
          authTag: encryptedAccess.authTag
        },
        refreshToken: {
          keyId: tokenCipher.keyId,
          ciphertext: encryptedRefresh.ciphertext,
          iv: encryptedRefresh.iv,
          authTag: encryptedRefresh.authTag
        },
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        updatedAt: now,
        "syncMetadata.lastMetricsErrorAt": null
      }
    }
  );

  await users.updateOne(
    { _id: account.userId },
    {
      $set: {
        "tiktokAuth.keyId": tokenCipher.keyId,
        "tiktokAuth.accessToken": encryptedAccess.ciphertext,
        "tiktokAuth.accessTokenIv": encryptedAccess.iv,
        "tiktokAuth.accessTokenTag": encryptedAccess.authTag,
        "tiktokAuth.refreshToken": encryptedRefresh.ciphertext,
        "tiktokAuth.refreshTokenIv": encryptedRefresh.iv,
        "tiktokAuth.refreshTokenTag": encryptedRefresh.authTag,
        "tiktokAuth.accessTokenExpiresAt": accessTokenExpiresAt,
        "tiktokAuth.refreshTokenExpiresAt": refreshTokenExpiresAt,
        "tiktokAuth.scope": account.scopes
      }
    }
  );

  account.accessToken = {
    keyId: tokenCipher.keyId,
    ciphertext: encryptedAccess.ciphertext,
    iv: encryptedAccess.iv,
    authTag: encryptedAccess.authTag
  } as TikTokAccountRecord["accessToken"];
  account.refreshToken = {
    keyId: tokenCipher.keyId,
    ciphertext: encryptedRefresh.ciphertext,
    iv: encryptedRefresh.iv,
    authTag: encryptedRefresh.authTag
  } as TikTokAccountRecord["refreshToken"];
  account.accessTokenExpiresAt = accessTokenExpiresAt;
  account.refreshTokenExpiresAt = refreshTokenExpiresAt;

  return { accessToken: data.access_token, account };
};

const callDisplayApi = async <T>(
  path: string,
  options: RequestInit,
  logger: Logger,
  requestId: string | undefined,
  context: Record<string, unknown> = {}
): Promise<T> => {
  const url = `${DISPLAY_API_BASE_URL}${path}`;
  const response = await fetch(url, options);

  if (!response.ok) {
    const errorBody = await safeParseJson(response);
    logger.error(
      { event: "tiktok.display_api_error", status: response.status, body: errorBody, requestId, path, ...context },
      "TikTok Display API request failed"
    );
    throw new Error(`TikTok Display API responded with status ${response.status}`);
  }

  return (await response.json()) as T;
};

const fetchCreatorVideos = async (
  accessToken: string,
  logger: Logger,
  requestId?: string
): Promise<TikTokDisplayVideo[]> => {
  const videos: TikTokDisplayVideo[] = [];
  let cursor: string | null = null;
  let hasMore = true;
  const seenCursors = new Set<string>();

  while (hasMore) {
    const response = await callDisplayApi<TikTokVideoListResponse>(
      DISPLAY_VIDEO_LIST_PATH,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          cursor,
          max_count: PAGE_SIZE
        })
      },
      logger,
      requestId,
      { operation: "video.list" }
    );

    if (response.error) {
      logger.error(
        { event: "tiktok.video.list_error", error: response.error, requestId },
        "TikTok returned an error when listing videos"
      );
      throw new Error("TikTok returned an error when listing videos");
    }

    const page = response.data?.videos ?? [];
    videos.push(...page);

    const nextCursor = response.data?.cursor ?? null;
    hasMore = Boolean(response.data?.has_more && nextCursor);

    if (!hasMore) {
      break;
    }

    const cursorKey = nextCursor ?? "";
    if (seenCursors.has(cursorKey)) {
      logger.warn(
        { event: "tiktok.video.duplicate_cursor", cursor: nextCursor, requestId },
        "TikTok returned a duplicate cursor; stopping pagination"
      );
      break;
    }

    seenCursors.add(cursorKey);
    cursor = nextCursor;
  }

  return videos;
};

const fetchVideoMetrics = async (
  accessToken: string,
  videoIds: string[],
  logger: Logger,
  requestId?: string
): Promise<Map<string, TikTokDisplayVideo["stats"]>> => {
  if (videoIds.length === 0) {
    return new Map();
  }

  const response = await callDisplayApi<TikTokVideoMetricsResponse>(
    DISPLAY_VIDEO_DATA_PATH,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        video_ids: videoIds
      })
    },
    logger,
    requestId,
    { operation: "video.data", count: videoIds.length }
  );

  if (response.error) {
    logger.error(
      { event: "tiktok.video.metrics_error", error: response.error, requestId },
      "TikTok returned an error when fetching metrics"
    );
    throw new Error("TikTok returned an error when fetching metrics");
  }

  const metrics = new Map<string, TikTokDisplayVideo["stats"]>();
  for (const entry of response.data?.metrics ?? []) {
    if (entry.id) {
      metrics.set(entry.id, entry.stats ?? {});
    }
  }

  return metrics;
};

const publishVideoUpdate = async (
  redis: IORedis,
  accountId: string,
  payload: Record<string, unknown>
) => {
  const channel = `${TIKTOK_VIDEO_UPDATE_CHANNEL}:${accountId}`;
  await redis.publish(channel, JSON.stringify({ ...payload, accountId }));
};

export const createInitialSyncJobHandler = (options: {
  refreshQueue: Queue<TikTokMetricsRefreshJob>;
  redisPublisher: IORedis;
  getMongoDb?: typeof getMongoDb;
}) => {
  const { refreshQueue, redisPublisher, getMongoDb: resolveMongoDb = getMongoDb } = options;

  return async (job: Job<TikTokInitialSyncJob>) => {
    const data = tiktokInitialSyncJobSchema.parse(job.data);
    const logger = workerLogger.child({
      jobId: job.id,
      queue: job.queueName,
      accountId: data.accountId,
      requestId: data.requestId
    });

    const db = await resolveMongoDb();
    const accounts = db.collection<TikTokAccountRecord>("tiktok_accounts");
    const videosCollection = db.collection("videos");
    const accountObjectId = new Types.ObjectId(data.accountId);
    const account = await accounts.findOne({ _id: accountObjectId });

    if (!account) {
      logger.warn({ event: "tiktok.account.not_found" }, "TikTok account not found during initial sync");
      return { status: "account_not_found" };
    }

    try {
      const { accessToken } = await ensureValidAccessToken(account, db, logger, data.requestId);
      const videos = await fetchCreatorVideos(accessToken, logger, data.requestId);
      const now = new Date();
      let upserted = 0;
      let updated = 0;

      for (const video of videos) {
        try {
          const operation = transformDisplayVideo(video, accountObjectId, now);
          const update = {
            $set: { ...operation.update.$set },
            $setOnInsert: { ...operation.update.$setOnInsert }
          } as typeof operation.update;

          if (update.$set.postedAt === undefined) {
            delete (update.$set as Record<string, unknown>).postedAt;
          }

          const result = await videosCollection.updateOne(operation.filter, update, { upsert: true });
          if (result.upsertedCount && result.upsertedCount > 0) {
            upserted += 1;
          } else if (result.modifiedCount > 0) {
            updated += 1;
          }
        } catch (error) {
          logger.error(
            { event: "tiktok.video.upsert_failed", videoId: video.id, error: (error as Error).message },
            "Failed to upsert TikTok video"
          );
        }
      }

      await accounts.updateOne(
        { _id: accountObjectId },
        {
          $set: {
            "syncMetadata.lastVideoSyncAt": now,
            "syncMetadata.lastMetricsRefreshAt": now,
            updatedAt: now
          }
        }
      );

      await publishVideoUpdate(redisPublisher, data.accountId, {
        event: "tiktok.videos.initial_sync",
        videoCount: videos.length,
        upserted,
        updated,
        requestId: data.requestId,
        trigger: data.trigger
      });

      try {
        await refreshQueue.add(
          "metrics-refresh",
          tiktokMetricsRefreshJobSchema.parse({
            accountId: data.accountId,
            reason: "scheduled",
            requestId: data.requestId,
            queuedAt: now.toISOString(),
            retryCount: 0
          }),
          {
            jobId: `${TIKTOK_REFRESH_QUEUE}:${data.accountId}`,
            repeat: {
              every: REFRESH_INTERVAL_MS
            },
            removeOnComplete: 50,
            removeOnFail: 20
          }
        );
      } catch (error) {
        const message = (error as Error).message ?? "";
        if (!message.includes("already exists")) {
          throw error;
        }

        logger.debug(
          { event: "tiktok.metrics.refresh_job_exists", accountId: data.accountId },
          "Metrics refresh job already scheduled"
        );
      }

      logger.info(
        {
          event: "tiktok.ingestion.completed",
          requestId: data.requestId,
          videos: videos.length,
          upserted,
          updated
        },
        "Completed TikTok initial sync"
      );

      return { videos: videos.length, upserted, updated };
    } catch (error) {
      const errorMessage = (error as Error).message;
      await accounts.updateOne(
        { _id: accountObjectId },
        { $set: { "syncMetadata.lastMetricsErrorAt": new Date() } }
      );

      logger.error(
        { event: "tiktok.ingestion.failed", error: errorMessage, requestId: data.requestId },
        "TikTok initial sync failed"
      );
      throw error;
    }
  };
};

export const createMetricsRefreshJobHandler = (options: {
  redisPublisher: IORedis;
  getMongoDb?: typeof getMongoDb;
}) => {
  const { redisPublisher, getMongoDb: resolveMongoDb = getMongoDb } = options;

  return async (job: Job<TikTokMetricsRefreshJob>) => {
    const data = tiktokMetricsRefreshJobSchema.parse(job.data);
    const logger = workerLogger.child({
      jobId: job.id,
      queue: job.queueName,
      accountId: data.accountId,
      requestId: data.requestId
    });

    const db = await resolveMongoDb();
    const accounts = db.collection<TikTokAccountRecord>("tiktok_accounts");
    const videosCollection = db.collection("videos");
    const accountObjectId = new Types.ObjectId(data.accountId);
    const account = await accounts.findOne({ _id: accountObjectId });

    if (!account) {
      logger.warn({ event: "tiktok.account.not_found" }, "TikTok account not found during metrics refresh");
      return { status: "account_not_found" };
    }

    try {
      const { accessToken } = await ensureValidAccessToken(account, db, logger, data.requestId);
      const videoDocs = await videosCollection
        .find({ ownerTikTokAccountId: accountObjectId })
        .project<{ tiktokVideoId: string }>({ tiktokVideoId: 1 })
        .toArray();

      const videoIds = videoDocs.map((doc) => doc.tiktokVideoId).filter(Boolean);
      let updated = 0;
      const now = new Date();

      for (const batch of chunkArray(videoIds, METRICS_BATCH_SIZE)) {
        if (batch.length === 0) {
          continue;
        }

        const metrics = await fetchVideoMetrics(accessToken, batch, logger, data.requestId);

        for (const videoId of batch) {
          const stats = sanitizeDisplayMetrics(metrics.get(videoId));
          const update = {
            $set: {
              metrics: stats,
              lastRefreshedAt: now,
              updatedAt: now
            }
          };

          const result = await videosCollection.updateOne({ tiktokVideoId: videoId }, update);
          if (result.modifiedCount > 0) {
            updated += 1;
          }
        }
      }

      await accounts.updateOne(
        { _id: accountObjectId },
        {
          $set: {
            "syncMetadata.lastMetricsRefreshAt": now,
            "syncMetadata.lastMetricsErrorAt": null,
            updatedAt: now
          }
        }
      );

      await publishVideoUpdate(redisPublisher, data.accountId, {
        event: "tiktok.videos.metrics_refreshed",
        updated,
        total: videoIds.length,
        requestId: data.requestId,
        reason: data.reason
      });

      logger.info(
        { event: "tiktok.metrics.refresh.completed", updated, total: videoIds.length, requestId: data.requestId },
        "TikTok metrics refresh completed"
      );

      return { updated, total: videoIds.length };
    } catch (error) {
      const errorMessage = (error as Error).message;
      await accounts.updateOne(
        { _id: accountObjectId },
        { $set: { "syncMetadata.lastMetricsErrorAt": new Date() } }
      );

      logger.error(
        { event: "tiktok.metrics.refresh_failed", error: errorMessage, requestId: data.requestId },
        "TikTok metrics refresh failed"
      );
      throw error;
    }
  };
};

import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";

import { getDefaultTikTokDisplayScopes } from "@trendpot/utils";

import type { AuthAuditService } from "../auth/auth-audit.service";
import type { RateLimitService } from "../auth/rate-limit.service";
import type { RedisService } from "../redis/redis.service";
import { PlatformAuthService } from "./platform-auth.service";
import type { TikTokAccountDocument } from "../models/tiktok-account.schema";
import { TikTokTokenCipher } from "@trendpot/utils";
import { TikTokTokenService } from "../security/tiktok-token.service";
import type { TikTokIngestionQueue } from "../tiktok/tiktok-ingestion.queue";

const createLogger = () => ({
  info: () => {},
  warn: () => {},
  error: () => {}
});

test("createTikTokLoginIntent persists resolved scopes in Redis state", async (t) => {
  const previousEnv = {
    TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY,
    TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET,
    TIKTOK_REDIRECT_URI: process.env.TIKTOK_REDIRECT_URI,
    TIKTOK_DISPLAY_SCOPES: process.env.TIKTOK_DISPLAY_SCOPES,
    TIKTOK_STATE_TTL_SECONDS: process.env.TIKTOK_STATE_TTL_SECONDS
  } as const;

  process.env.TIKTOK_CLIENT_KEY = "client-key";
  process.env.TIKTOK_CLIENT_SECRET = "client-secret";
  process.env.TIKTOK_REDIRECT_URI = "https://app.trendpot.test/api/auth/tiktok/callback";
  delete process.env.TIKTOK_DISPLAY_SCOPES;
  process.env.TIKTOK_STATE_TTL_SECONDS = "900";

  const redisCalls: Array<{ key: string; value: string; mode: string; ttl: number }> = [];

  const redisService = {
    getClient: () => ({
      async set(key: string, value: string, mode: string, ttl: number) {
        redisCalls.push({ key, value, mode, ttl });
        return "OK";
      }
    })
  } as unknown as RedisService;

  const service = new PlatformAuthService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      consume: async () => ({ allowed: true, retryAt: Date.now() + 1_000 })
    } as unknown as RateLimitService,
    {
      recordRateLimitViolation: () => {},
      recordAuthorizationFailure: () => {}
    } as unknown as AuthAuditService,
    redisService,
    {} as never,
    {} as never
  );

  const logger = createLogger();

  const intent = await service.createTikTokLoginIntent({
    logger,
    requestId: "req-scope-default",
    ipAddress: "203.0.113.10"
  });

  const expectedScopes = getDefaultTikTokDisplayScopes();

  assert.deepEqual(intent.scopes, expectedScopes);
  assert.equal(redisCalls.length, 1);

  const recordedState = redisCalls[0];
  assert.equal(recordedState.mode, "EX");
  assert.equal(recordedState.ttl, 900);
  assert.equal(recordedState.key, `tiktok:state:${intent.state}`);

  const parsedState = JSON.parse(recordedState.value) as { scopes: string[] };
  assert.deepEqual(parsedState.scopes, expectedScopes);

  t.after(() => {
    if (previousEnv.TIKTOK_CLIENT_KEY === undefined) {
      delete process.env.TIKTOK_CLIENT_KEY;
    } else {
      process.env.TIKTOK_CLIENT_KEY = previousEnv.TIKTOK_CLIENT_KEY;
    }

    if (previousEnv.TIKTOK_CLIENT_SECRET === undefined) {
      delete process.env.TIKTOK_CLIENT_SECRET;
    } else {
      process.env.TIKTOK_CLIENT_SECRET = previousEnv.TIKTOK_CLIENT_SECRET;
    }

    if (previousEnv.TIKTOK_REDIRECT_URI === undefined) {
      delete process.env.TIKTOK_REDIRECT_URI;
    } else {
      process.env.TIKTOK_REDIRECT_URI = previousEnv.TIKTOK_REDIRECT_URI;
    }

    if (previousEnv.TIKTOK_DISPLAY_SCOPES === undefined) {
      delete process.env.TIKTOK_DISPLAY_SCOPES;
    } else {
      process.env.TIKTOK_DISPLAY_SCOPES = previousEnv.TIKTOK_DISPLAY_SCOPES;
    }

    if (previousEnv.TIKTOK_STATE_TTL_SECONDS === undefined) {
      delete process.env.TIKTOK_STATE_TTL_SECONDS;
    } else {
      process.env.TIKTOK_STATE_TTL_SECONDS = previousEnv.TIKTOK_STATE_TTL_SECONDS;
    }
  });
});

test("upsertTikTokAccount enqueues an initial sync for linked users", async () => {
  const tokenService = new TikTokTokenService(
    new TikTokTokenCipher({ key: Buffer.alloc(32, 2).toString("base64"), keyId: "test-key" })
  );
  const encryptedAccess = tokenService.encrypt("access-token");
  const encryptedRefresh = tokenService.encrypt("refresh-token");

  const userId = new Types.ObjectId();
  const accountId = new Types.ObjectId();

  let capturedPayload: unknown;

  const ingestionQueue: Pick<TikTokIngestionQueue, "enqueueInitialSync"> = {
    async enqueueInitialSync(payload) {
      capturedPayload = payload;
    }
  };

  const accountDoc = {
    id: accountId.toHexString(),
    _id: accountId
  } as unknown as TikTokAccountDocument;

  const service = new PlatformAuthService(
    {} as never,
    {} as never,
    {} as never,
    {
      findOneAndUpdate: () => ({
        exec: async () => {
          return accountDoc;
        }
      })
    } as never,
    {} as never,
    {} as never,
    {} as never,
    tokenService,
    ingestionQueue as TikTokIngestionQueue
  );

  const logger = createLogger();
  const now = new Date();

  await (service as unknown as {
    upsertTikTokAccount(params: {
      user: { id: string; _id: Types.ObjectId; displayName?: string | null };
      profile: { username?: string | null; displayName?: string | null; avatarUrl?: string | null };
      tokenExchange: { openId: string; scope: string[] };
      encryptedAccess: typeof encryptedAccess;
      encryptedRefresh: typeof encryptedRefresh;
      accessTokenExpiresAt: Date;
      refreshTokenExpiresAt: Date;
      logger: ReturnType<typeof createLogger>;
      requestId: string;
    }): Promise<TikTokAccountDocument | null>;
  }).upsertTikTokAccount({
    user: { id: userId.toHexString(), _id: userId, displayName: "Creator" },
    profile: { username: "creator", displayName: "Creator" },
    tokenExchange: { openId: "open-123", scope: ["user.info.basic", "video.list"] },
    encryptedAccess,
    encryptedRefresh,
    accessTokenExpiresAt: new Date(now.getTime() + 60_000),
    refreshTokenExpiresAt: new Date(now.getTime() + 120_000),
    logger,
    requestId: "req-1"
  });

  assert.ok(capturedPayload, "expected ingestion job to be enqueued");
  assert.deepEqual(capturedPayload, {
    accountId: accountId.toHexString(),
    userId: userId.toHexString(),
    trigger: "account_linked",
    requestId: "req-1",
    queuedAt: (capturedPayload as { queuedAt: string }).queuedAt
  });
  assert.match((capturedPayload as { queuedAt: string }).queuedAt, /T/);
});

test("upsertTikTokAccount logs a warning when user id cannot be resolved", async () => {
  const tokenService = new TikTokTokenService(
    new TikTokTokenCipher({ key: Buffer.alloc(32, 3).toString("base64"), keyId: "test-key" })
  );
  const encryptedAccess = tokenService.encrypt("access-token");
  const encryptedRefresh = tokenService.encrypt("refresh-token");

  const accountId = new Types.ObjectId();
  const warnings: Array<Record<string, unknown>> = [];

  const ingestionQueue: Pick<TikTokIngestionQueue, "enqueueInitialSync"> = {
    async enqueueInitialSync() {
      throw new Error("should not be called");
    }
  };

  const logger = {
    info: () => {},
    error: () => {},
    warn: (payload: Record<string, unknown>) => {
      warnings.push(payload);
    }
  };

  const service = new PlatformAuthService(
    {} as never,
    {} as never,
    {} as never,
    {
      findOneAndUpdate: () => ({
        exec: async () => ({ id: accountId.toHexString(), _id: accountId } as TikTokAccountDocument)
      })
    } as never,
    {} as never,
    {} as never,
    {} as never,
    tokenService,
    ingestionQueue as TikTokIngestionQueue
  );

  await (service as unknown as {
    upsertTikTokAccount(params: {
      user: { _id: Types.ObjectId };
      profile: { username?: string | null; displayName?: string | null; avatarUrl?: string | null };
      tokenExchange: { openId: string; scope: string[] };
      encryptedAccess: typeof encryptedAccess;
      encryptedRefresh: typeof encryptedRefresh;
      accessTokenExpiresAt: Date;
      refreshTokenExpiresAt: Date;
      logger: typeof logger;
      requestId: string;
    }): Promise<TikTokAccountDocument | null>;
  }).upsertTikTokAccount({
    user: { _id: new Types.ObjectId() },
    profile: { username: null, displayName: null },
    tokenExchange: { openId: "open-456", scope: ["user.info.basic"] },
    encryptedAccess,
    encryptedRefresh,
    accessTokenExpiresAt: new Date(),
    refreshTokenExpiresAt: new Date(),
    logger,
    requestId: "req-2"
  });

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.event, "tiktok.ingestion.missing_user_id");
});

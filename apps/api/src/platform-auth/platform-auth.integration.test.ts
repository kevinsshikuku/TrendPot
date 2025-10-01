import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

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

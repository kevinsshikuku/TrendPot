import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

import { TIKTOK_VIDEO_UPDATE_CHANNEL } from "@trendpot/types";
import { TikTokTokenCipher } from "@trendpot/utils";
import type IORedis from "ioredis";

import { createMetricsRefreshJobHandler } from "./tiktok-jobs";

test("metrics refresh handler updates metrics and publishes redis notifications", async (t) => {
  const accountId = new Types.ObjectId();
  const cipher = new TikTokTokenCipher();
  const encryptedAccess = cipher.encrypt("access-token");
  const encryptedRefresh = cipher.encrypt("refresh-token");

  const accountRecord = {
    _id: accountId,
    userId: new Types.ObjectId(),
    openId: "creator-open-id",
    username: "creator",
    scopes: ["video.data"],
    accessToken: {
      keyId: cipher.keyId,
      ciphertext: encryptedAccess.ciphertext,
      iv: encryptedAccess.iv,
      authTag: encryptedAccess.authTag
    },
    refreshToken: {
      keyId: cipher.keyId,
      ciphertext: encryptedRefresh.ciphertext,
      iv: encryptedRefresh.iv,
      authTag: encryptedRefresh.authTag
    },
    accessTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  };

  const videoDocs = [
    { tiktokVideoId: "video-1", ownerTikTokAccountId: accountId },
    { tiktokVideoId: "video-2", ownerTikTokAccountId: accountId }
  ];

  const videoUpdates: Array<{ filter: unknown; update: unknown }> = [];
  const accountUpdates: Array<{ filter: unknown; update: unknown }> = [];

  const dbStub = {
    collection(name: string) {
      if (name === "tiktok_accounts") {
        return {
          findOne: async (filter: unknown) => {
            assert.deepEqual(filter, { _id: accountId });
            return accountRecord;
          },
          updateOne: async (filter: unknown, update: unknown) => {
            accountUpdates.push({ filter, update });
            return { acknowledged: true };
          }
        };
      }

      if (name === "videos") {
        return {
          find: () => ({
            project: () => ({
              toArray: async () => videoDocs
            })
          }),
          updateOne: async (filter: unknown, update: { $set: { metrics: { viewCount: number } } }) => {
            videoUpdates.push({ filter, update });
            return { modifiedCount: 1 };
          }
        };
      }

      throw new Error(`Unexpected collection ${name}`);
    }
  };

  const published: Array<{ channel: string; payload: Record<string, unknown> }> = [];
  const redisPublisher = {
    publish: async (channel: string, message: string) => {
      published.push({ channel, payload: JSON.parse(message) });
      return 1;
    }
  };

  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: {
        metrics: [
          { id: "video-1", stats: { play_count: 120, digg_count: 10, comment_count: 4, share_count: 2 } },
          { id: "video-2", stats: { play_count: 80, digg_count: 5, comment_count: 1, share_count: 1 } }
        ]
      }
    }
  }) as unknown as Response;

  const handler = createMetricsRefreshJobHandler({
    redisPublisher: redisPublisher as unknown as IORedis,
    getMongoDb: async () => dbStub as never
  });

  const job = {
    id: "job-1",
    queueName: "tiktok:refresh",
    data: {
      accountId: accountId.toHexString(),
      reason: "manual",
      queuedAt: new Date().toISOString(),
      requestId: "req-123",
      retryCount: 0
    }
  };

  const result = await handler(job as never);

  assert.equal(result.updated, 2);
  assert.equal(result.total, 2);

  assert.equal(videoUpdates.length, 2);
  for (const update of videoUpdates) {
    const set = (update.update as { $set: { metrics: { viewCount: number } } }).$set;
    assert.ok(set.metrics.viewCount === 120 || set.metrics.viewCount === 80);
    assert.ok(set.metrics.likeCount === undefined || typeof set.metrics.likeCount === "number");
  }

  assert.equal(accountUpdates.length, 1);
  const accountUpdate = accountUpdates[0];
  assert.deepEqual(accountUpdate.filter, { _id: accountId });

  assert.equal(published.length, 1);
  assert.equal(published[0].channel, `${TIKTOK_VIDEO_UPDATE_CHANNEL}:${accountId.toHexString()}`);
  assert.equal(published[0].payload.event, "tiktok.videos.metrics_refreshed");
  assert.equal(published[0].payload.updated, 2);
  assert.equal(published[0].payload.total, 2);
});

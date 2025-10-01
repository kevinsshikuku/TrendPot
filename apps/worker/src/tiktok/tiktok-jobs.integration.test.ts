import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "mongoose";

import type { Queue } from "bullmq";
import { TIKTOK_VIDEO_UPDATE_CHANNEL, type TikTokMetricsRefreshJob } from "@trendpot/types";
import { TikTokTokenCipher } from "@trendpot/utils";
import type IORedis from "ioredis";

import { createInitialSyncJobHandler, createMetricsRefreshJobHandler } from "./tiktok-jobs";

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

test("initial sync handler fetches subsequent TikTok pages and upserts all videos", async (t) => {
  const accountId = new Types.ObjectId();
  const cipher = new TikTokTokenCipher();
  const encryptedAccess = cipher.encrypt("access-token");
  const encryptedRefresh = cipher.encrypt("refresh-token");

  const accountRecord = {
    _id: accountId,
    userId: new Types.ObjectId(),
    openId: "creator-open-id",
    username: "creator",
    scopes: ["video.list"],
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

  const videoOperations: Array<{ filter: unknown; update: unknown }> = [];
  const accountUpdates: Array<{ filter: unknown; update: unknown }> = [];
  const scheduledJobs: Array<{ name: string }> = [];

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
          updateOne: async (filter: unknown, update: unknown) => {
            videoOperations.push({ filter, update });
            return { upsertedCount: 1 };
          }
        };
      }

      throw new Error(`Unexpected collection ${name}`);
    }
  };

  const refreshQueue = {
    async add(name: string) {
      scheduledJobs.push({ name });
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
  const fetchCalls: Array<{ cursor: string | null; max_count: number }> = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const pages = [
    {
      videos: [
        {
          id: "video-1",
          description: "first",
          create_time: Math.floor(Date.now() / 1000),
          share_url: "https://www.tiktok.com/@creator/video/video-1",
          author: { username: "creator" },
          stats: { play_count: 10 }
        },
        {
          id: "video-2",
          description: "second",
          create_time: Math.floor(Date.now() / 1000) - 10,
          share_url: "https://www.tiktok.com/@creator/video/video-2",
          author: { username: "creator" },
          stats: { play_count: 8 }
        }
      ],
      cursor: "cursor-1",
      has_more: true
    },
    {
      videos: [
        {
          id: "video-3",
          description: "third",
          create_time: Math.floor(Date.now() / 1000) - 20,
          share_url: "https://www.tiktok.com/@creator/video/video-3",
          author: { username: "creator" },
          stats: { play_count: 6 }
        }
      ],
      cursor: "cursor-2",
      has_more: true
    },
    {
      videos: [
        {
          id: "video-4",
          description: "fourth",
          create_time: Math.floor(Date.now() / 1000) - 30,
          share_url: "https://www.tiktok.com/@creator/video/video-4",
          author: { username: "creator" },
          stats: { play_count: 4 }
        }
      ],
      cursor: null,
      has_more: false
    }
  ];

  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : { cursor: null, max_count: 0 };
    fetchCalls.push({ cursor: body.cursor ?? null, max_count: body.max_count ?? 0 });
    const page = pages.shift() ?? { videos: [], cursor: null, has_more: false };
    return {
      ok: true,
      json: async () => ({
        data: {
          videos: page.videos,
          cursor: page.cursor,
          has_more: page.has_more
        }
      })
    } as Response;
  }) as typeof fetch;

  const handler = createInitialSyncJobHandler({
    refreshQueue: refreshQueue as unknown as Queue<TikTokMetricsRefreshJob>,
    redisPublisher: redisPublisher as unknown as IORedis,
    getMongoDb: async () => dbStub as never
  });

  const job = {
    id: "job-1",
    queueName: "tiktok:ingestion",
    data: {
      accountId: accountId.toHexString(),
      userId: new Types.ObjectId().toHexString(),
      requestId: "req-456",
      trigger: "manual",
      queuedAt: new Date().toISOString()
    }
  };

  const result = await handler(job as never);

  assert.equal(fetchCalls.length, 3);
  assert.deepEqual(fetchCalls.map((call) => call.cursor), [null, "cursor-1", "cursor-2"]);
  assert.equal(videoOperations.length, 4);
  assert.equal(result.videos, 4);

  assert.equal(accountUpdates.length >= 1, true);
  assert.equal(published.length, 1);
  assert.equal(published[0].payload.videoCount, 4);
  assert.equal(scheduledJobs.length, 1);
});

import assert from "node:assert/strict";
import test from "node:test";

import { BadRequestException } from "@nestjs/common";
import { Types } from "mongoose";
import type { Logger } from "pino";

import { TikTokDisplayService } from "./tiktok.service";

const createLogger = (): Logger =>
  ({
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    fatal: () => undefined,
    level: "info"
  } as unknown as Logger);

const createVideoModel = () => {
  const store = new Map<string, any>();

  return {
    store,
    findOne: (query: { tiktokVideoId: string }) => ({
      exec: async () => store.get(query.tiktokVideoId) ?? null
    }),
    findOneAndUpdate: (
      filter: { tiktokVideoId: string },
      update: {
        $set?: Record<string, unknown>;
        $setOnInsert?: Record<string, unknown>;
      }
    ) => ({
      exec: async () => {
        const existing = store.get(filter.tiktokVideoId) ?? {
          _id: new Types.ObjectId(),
          tiktokVideoId: filter.tiktokVideoId
        };
        const next = {
          ...existing,
          ...(update.$setOnInsert ?? {}),
          ...(update.$set ?? {})
        };
        store.set(filter.tiktokVideoId, next);
        return next;
      }
    })
  };
};

const createService = () => {
  const videoModel = createVideoModel();
  const service = new TikTokDisplayService(
    {} as any,
    {} as any,
    videoModel as any,
    {} as any,
    {} as any,
    {} as any,
    {
      decryptAccountToken: () => "token",
      keyId: "kid"
    } as any,
    {} as any
  );

  const responses: any[] = [];
  const paths: string[] = [];

  (service as any).ensureValidAccessToken = async () => "token";
  (service as any).callDisplayApi = async (path: string) => {
    paths.push(path);
    if (responses.length === 0) {
      throw new Error("No mocked response available");
    }
    return responses.shift();
  };

  return { service, videoModel, responses, paths };
};

const createAccount = () => ({
  _id: new Types.ObjectId(),
  username: "creator123"
});

test("TikTokDisplayService.ensureVideoAvailable persists the video when /video/data returns a matching entry", async () => {
    const { service, videoModel, responses, paths } = createService();
    responses.push({
      data: {
        videos: [
          {
            id: "12345",
            description: "A cool trick",
            share_url: "https://www.tiktok.com/@creator123/video/12345",
            embed_html:
              '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@creator123/video/12345"></blockquote>',
            author: { username: "creator123" },
            create_time: 1_700_000_000
          }
        ],
        metrics: [
          {
            id: "12345",
            stats: {
              digg_count: 15.8,
              comment_count: 4.2,
              share_count: -1,
              play_count: 320.6
            }
          }
        ]
      }
    });

    const account = createAccount();
    const logger = createLogger();

    const result = await (service as any).ensureVideoAvailable(account, "12345", logger, "req-1");

    assert.deepStrictEqual(paths, ["/v2/video/data/"]);
    assert.ok(result);
    assert.strictEqual(result.tiktokVideoId, "12345");
    assert.deepStrictEqual(result.metrics, {
      likeCount: 15,
      commentCount: 4,
      shareCount: 0,
      viewCount: 320
    });

    const stored = await videoModel.findOne({ tiktokVideoId: "12345" }).exec();
    assert.ok(stored);
    assert.deepStrictEqual(stored.metrics, {
      likeCount: 15,
      commentCount: 4,
      shareCount: 0,
      viewCount: 320
    });
});

test("TikTokDisplayService.ensureVideoAvailable throws when /video/data cannot locate the requested video", async () => {
    const { service, responses, paths } = createService();
    responses.push({
      data: {
        videos: [],
        metrics: []
      }
    });

    const account = createAccount();
    const logger = createLogger();

    await assert.rejects(
      () => (service as any).ensureVideoAvailable(account, "missing", logger, "req-2"),
      BadRequestException
    );

    assert.deepStrictEqual(paths, ["/v2/video/data/"]);
});


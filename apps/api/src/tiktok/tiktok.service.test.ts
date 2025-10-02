import assert from "node:assert/strict";
import test from "node:test";

import { BadRequestException } from "@nestjs/common";
import { Types } from "mongoose";
import type { Logger } from "pino";

import type { AuthenticatedUser } from "../auth/auth.types";
import { TikTokDisplayService } from "./tiktok.service";

const createLogger = (): Logger => {
  const stub: any = {
    level: "info",
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    fatal: () => undefined,
    trace: () => undefined
  };

  stub.child = () => stub;

  return stub as Logger;
};

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

const encodeCursor = (payload: { postedAt: Date; id: Types.ObjectId; apiCursor?: string | null }) => {
  return Buffer.from(
    JSON.stringify({
      postedAt: payload.postedAt.toISOString(),
      id: payload.id.toHexString(),
      apiCursor: payload.apiCursor ?? null
    })
  ).toString("base64");
};

const decodeCursor = (cursor: string) => {
  return JSON.parse(Buffer.from(cursor, "base64").toString("utf8")) as {
    postedAt: string;
    id: string;
    apiCursor: string | null;
  };
};

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

test("listCreatorVideos paginates TikTok responses and encodes next cursor", async () => {
  const accountId = new Types.ObjectId();
  const account = {
    _id: accountId,
    openId: "creator-open-id",
    username: "creator",
    accessToken: { keyId: "key" },
    refreshToken: { keyId: "key" }
  };

  const accountFindCalls: unknown[] = [];
  const accountUpdateCalls: Array<{ filter: unknown; update: unknown }> = [];

  const accountModel = {
    findOne(filter: unknown) {
      accountFindCalls.push(filter);
      return {
        async exec() {
          return account;
        }
      };
    },
    updateOne(filter: unknown, update: unknown) {
      accountUpdateCalls.push({ filter, update });
      return {
        async exec() {
          return { acknowledged: true };
        }
      };
    }
  };

  const auditLogs: unknown[] = [];
  const auditLogModel = {
    async create(payload: unknown) {
      auditLogs.push(payload);
    }
  };

  const rateLimitService = {
    async consume() {
      return { allowed: true };
    }
  };

  const service = new TikTokDisplayService(
    {} as never,
    accountModel as never,
    {} as never,
    {} as never,
    {} as never,
    auditLogModel as never,
    {} as never,
    rateLimitService as never
  );

  const callRequests: Array<{ cursor: string | null; max_count: number }> = [];
  const persistedVideos: string[] = [];
  const apiPages = [
    {
      videos: [
        { id: "video-1", description: "first" },
        { id: "video-2", description: "second" }
      ],
      cursor: "cursor-a",
      has_more: true
    },
    {
      videos: [
        { id: "video-3", description: "third" },
        { id: "video-4", description: "fourth" }
      ],
      cursor: "cursor-b",
      has_more: true
    }
  ];

  Reflect.set(service as any, "ensureValidAccessToken", async () => "access-token");
  Reflect.set(service as any, "callDisplayApi", async (_path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { cursor: string | null; max_count: number };
    callRequests.push({ cursor: body.cursor, max_count: body.max_count });
    const page = apiPages.shift() ?? { videos: [], cursor: null, has_more: false };
    return {
      data: {
        videos: page.videos,
        cursor: page.cursor,
        has_more: page.has_more
      }
    };
  });
  Reflect.set(service as any, "upsertVideoFromDisplay", async (_account: unknown, video: { id: string }) => {
    persistedVideos.push(video.id);
  });

  const lastDocId = new Types.ObjectId();
  let buildArgs: {
    accountId: unknown;
    limit: number;
    cursor: unknown;
    options: { apiHasMore: boolean; nextApiCursor: string | null } | undefined;
  } | null = null;

  Reflect.set(
    service as any,
    "buildVideoConnection",
    async (
      accountIdArg: unknown,
      limitArg: number,
      cursorArg: unknown,
      optionsArg: { apiHasMore: boolean; nextApiCursor: string | null } | undefined
    ) => {
      buildArgs = { accountId: accountIdArg, limit: limitArg, cursor: cursorArg, options: optionsArg };
      return {
        edges: [
          {
            cursor: encodeCursor({ postedAt: new Date("2024-03-01T00:00:00Z"), id: lastDocId }),
            node: { id: "video-node" }
          }
        ],
        pageInfo: {
          endCursor: encodeCursor({
            postedAt: new Date("2024-03-02T00:00:00Z"),
            id: lastDocId,
            apiCursor: optionsArg?.nextApiCursor ?? null
          }),
          hasNextPage: Boolean(optionsArg?.apiHasMore)
        }
      };
    }
  );

  const user = {
    id: new Types.ObjectId().toHexString(),
    roles: ["creator"],
    tiktokUserId: "creator-open-id"
  } as unknown as AuthenticatedUser;

  const previousCursor = encodeCursor({
    postedAt: new Date("2024-02-01T00:00:00Z"),
    id: new Types.ObjectId(),
    apiCursor: "cursor-prev"
  });

  const logger = createLogger();

  const result = await service.listCreatorVideos({
    user,
    first: 4,
    after: previousCursor,
    logger,
    requestId: "req-123"
  });

  assert.equal(callRequests.length, 2);
  assert.deepEqual(callRequests[0], { cursor: "cursor-prev", max_count: 4 });
  assert.deepEqual(callRequests[1], { cursor: "cursor-a", max_count: 2 });

  assert.deepEqual(persistedVideos, ["video-1", "video-2", "video-3", "video-4"]);

  assert.ok(buildArgs);
  assert.equal(String((buildArgs as any).accountId), String(accountId));
  assert.equal(buildArgs?.limit, 4);
  assert.equal((buildArgs?.cursor as { apiCursor: string | null } | undefined)?.apiCursor, "cursor-prev");
  assert.equal(buildArgs?.options?.apiHasMore, true);
  assert.equal(buildArgs?.options?.nextApiCursor, "cursor-b");

  const pageInfoPayload = decodeCursor(result.pageInfo.endCursor ?? "");
  assert.equal(pageInfoPayload.apiCursor, "cursor-b");
  assert.equal(result.pageInfo.hasNextPage, true);

  assert.equal(accountFindCalls.length, 1);
  assert.equal(accountUpdateCalls.length, 1);
  assert.equal(auditLogs.length, 1);
  assert.match((auditLogs[0] as { context: { summary: string } }).context.summary, /Fetched 4 TikTok videos/);
});


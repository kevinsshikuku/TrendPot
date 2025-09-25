import assert from "node:assert/strict";
import test from "node:test";
import { Types } from "mongoose";
import { sanitizeDisplayMetrics, transformDisplayVideo } from "./transform";

test("transformDisplayVideo sanitizes and maps TikTok payloads", () => {
  const now = new Date("2024-01-01T00:00:00.000Z");
  const accountId = new Types.ObjectId();
  const result = transformDisplayVideo(
    {
      id: "123",
      description: "  A fun challenge video  ",
      share_url: "https://www.tiktok.com/@creator/video/123",
      embed_html:
        '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@creator/video/123"></blockquote>',
      create_time: 1_700_000_000,
      author: {
        username: "Creator",
        display_name: "Creator"
      },
      stats: {
        digg_count: 42.4,
        comment_count: 7,
        share_count: 2,
        play_count: 99
      }
    },
    accountId,
    now
  );

  assert.equal(result.filter.tiktokVideoId, "123");
  assert.equal(result.update.$set.shareUrl, "https://www.tiktok.com/@creator/video/123");
  assert.equal(result.update.$set.caption, "A fun challenge video");
  assert.equal(result.update.$set.ownerTikTokAccountId.toHexString(), accountId.toHexString());
  assert.equal(result.update.$set.metrics.likeCount, 42);
  assert.equal(result.update.$set.metrics.viewCount, 99);
  assert.ok(result.update.$set.embed.html.includes("tiktok-embed"));
  assert.deepEqual(result.update.$setOnInsert, {
    tiktokVideoId: "123",
    ownerTikTokAccountId: accountId,
    createdAt: now
  });
});

test("sanitizeDisplayMetrics normalizes undefined stats", () => {
  const metrics = sanitizeDisplayMetrics(undefined);
  assert.deepEqual(metrics, {
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    viewCount: 0
  });
});

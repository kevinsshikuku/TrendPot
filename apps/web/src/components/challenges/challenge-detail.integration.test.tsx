import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Challenge } from "@trendpot/types";
import { challengeQueryKey } from "../../lib/challenge-queries";
import { ChallengeDetail } from "./challenge-detail";

test("challenge detail renders TikTok submissions with metrics", () => {
  const challengeId = "challenge-123";
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } }
  });

  const embedHtml =
    '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@creator/video/123"><section><a href="https://www.tiktok.com/@creator/video/123">Watch on TikTok</a></section></blockquote>';

  const challenge: Challenge = {
    id: challengeId,
    title: "Clean Water Challenge",
    tagline: "Bring safe water to rural schools",
    description: "Every donation supports new wells and hygiene training.",
    raised: 2500000,
    goal: 5000000,
    currency: "KES",
    status: "live",
    updatedAt: "2024-05-10T00:00:00.000Z",
    createdAt: "2024-05-01T00:00:00.000Z",
    version: 3,
    submissions: {
      edges: [
        {
          cursor: "cursor-1",
          node: {
            id: "submission-1",
            challengeId,
            creatorUserId: "creator-1",
            videoId: "video-1",
            state: "approved",
            rejectionReason: null,
            createdAt: "2024-05-05T00:00:00.000Z",
            updatedAt: "2024-05-10T00:00:00.000Z",
            video: {
              id: "video-1",
              tiktokVideoId: "123",
              ownerAccountId: "account-1",
              shareUrl: "https://www.tiktok.com/@creator/video/123",
              caption: "Hero submission caption",
              postedAt: "2024-05-02T00:00:00.000Z",
              embed: {
                provider: "tiktok",
                html: embedHtml,
                scriptUrl: "https://www.tiktok.com/embed.js",
                width: 325,
                height: 720,
                authorName: "Creator One",
                authorUrl: "https://www.tiktok.com/@creator"
              },
              metrics: {
                viewCount: 9800,
                likeCount: 1200,
                commentCount: 230,
                shareCount: 54
              },
              lastRefreshedAt: "2024-05-10T00:00:00.000Z",
              createdAt: "2024-05-02T00:00:00.000Z",
              updatedAt: "2024-05-10T00:00:00.000Z"
            }
          }
        },
        {
          cursor: "cursor-2",
          node: {
            id: "submission-2",
            challengeId,
            creatorUserId: "creator-2",
            videoId: "video-2",
            state: "pending",
            rejectionReason: null,
            createdAt: "2024-05-06T00:00:00.000Z",
            updatedAt: "2024-05-10T00:00:00.000Z",
            video: {
              id: "video-2",
              tiktokVideoId: "456",
              ownerAccountId: "account-1",
              shareUrl: "https://www.tiktok.com/@creator/video/456",
              caption: "Secondary submission",
              postedAt: "2024-05-03T00:00:00.000Z",
              embed: {
                provider: "tiktok",
                html: embedHtml.replace("123", "456"),
                scriptUrl: "https://www.tiktok.com/embed.js"
              },
              metrics: {
                viewCount: 4500,
                likeCount: 320,
                commentCount: 44,
                shareCount: 18
              },
              lastRefreshedAt: "2024-05-10T00:00:00.000Z",
              createdAt: "2024-05-03T00:00:00.000Z",
              updatedAt: "2024-05-10T00:00:00.000Z"
            }
          }
        }
      ],
      pageInfo: { endCursor: "cursor-2", hasNextPage: false }
    }
  };

  queryClient.setQueryData(challengeQueryKey(challengeId), challenge);

  const markup = renderToString(
    <QueryClientProvider client={queryClient}>
      <ChallengeDetail challengeId={challengeId} />
    </QueryClientProvider>
  );

  assert.ok(markup.includes("Clean Water Challenge"));
  assert.ok(markup.includes("Watch on TikTok"));
  assert.ok(markup.includes("TikTok submissions"));
  assert.ok(markup.includes("Hero submission caption"));
  assert.ok(markup.includes("Secondary submission"));
  assert.ok(markup.includes("9800"));
  assert.ok(markup.includes("Preparing TikTok embed"));
  assert.ok(markup.includes("tiktok-embed"));
});

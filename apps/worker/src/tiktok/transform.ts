import { Types } from "mongoose";
import {
  tikTokEmbedHtmlSchema,
  tikTokEmbedSchema,
  videoMetricsSchema,
  type TikTokEmbed
} from "@trendpot/types";

export interface TikTokDisplayAuthor {
  open_id?: string;
  display_name?: string;
  avatar_url?: string;
  username?: string;
}

export interface TikTokDisplayStats {
  digg_count?: number;
  comment_count?: number;
  share_count?: number;
  play_count?: number;
  view_count?: number;
}

export interface TikTokDisplayVideo {
  id: string;
  create_time?: number;
  description?: string;
  embed_html?: string;
  share_url?: string;
  cover_image_url?: string;
  author?: TikTokDisplayAuthor;
  video?: { cover_image_url?: string };
  stats?: TikTokDisplayStats;
}

export interface VideoUpsertOperation {
  filter: { tiktokVideoId: string };
  update: {
    $set: {
      ownerTikTokAccountId: Types.ObjectId;
      shareUrl: string;
      caption: string | null;
      embed: TikTokEmbed;
      postedAt?: Date;
      metrics: {
        likeCount: number;
        commentCount: number;
        shareCount: number;
        viewCount: number;
      };
      lastRefreshedAt: Date;
      updatedAt: Date;
    };
    $setOnInsert: {
      tiktokVideoId: string;
      ownerTikTokAccountId: Types.ObjectId;
      createdAt: Date;
    };
  };
}

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

const sanitizeShareUrl = (value: string, username?: string | null): string => {
  const trimmed = value?.trim();
  if (trimmed) {
    try {
      const url = new URL(trimmed);
      if (url.protocol === "https:" && url.hostname.includes("tiktok")) {
        return url.toString();
      }
    } catch {
      // fall back to deterministic URL below
    }
  }

  if (username) {
    return `https://www.tiktok.com/@${username}/video/${value}`;
  }

  return `https://www.tiktok.com/@trendpot/video/${value}`;
};

const buildAuthorUrl = (author?: TikTokDisplayAuthor): string | undefined => {
  const username = author?.username ?? author?.open_id;
  if (!username) {
    return undefined;
  }

  return `https://www.tiktok.com/@${username}`;
};

const sanitizeEmbed = (
  shareUrl: string,
  embedHtml: string | undefined,
  author?: TikTokDisplayAuthor,
  thumbnailUrl?: string
): TikTokEmbed => {
  if (embedHtml) {
    const parsedHtml = tikTokEmbedHtmlSchema.parse(embedHtml);
    const sanitized = tikTokEmbedSchema.parse({
      provider: "tiktok",
      html: parsedHtml,
      scriptUrl: "https://www.tiktok.com/embed.js",
      width: undefined,
      height: undefined,
      thumbnailUrl,
      authorName: author?.display_name ?? author?.username,
      authorUrl: buildAuthorUrl(author)
    });

    return sanitized;
  }

  const fallbackHtml = `<blockquote class="tiktok-embed" cite="${shareUrl}" data-video-id="${shareUrl}"></blockquote>`;
  const sanitized = tikTokEmbedSchema.parse({
    provider: "tiktok",
    html: fallbackHtml,
    scriptUrl: "https://www.tiktok.com/embed.js",
    width: undefined,
    height: undefined,
    thumbnailUrl,
    authorName: author?.display_name ?? author?.username,
    authorUrl: buildAuthorUrl(author)
  });

  return sanitized;
};

export const sanitizeDisplayMetrics = (stats: TikTokDisplayStats | undefined) =>
  videoMetricsSchema.parse({
    likeCount: Math.max(0, Math.trunc(stats?.digg_count ?? 0)),
    commentCount: Math.max(0, Math.trunc(stats?.comment_count ?? 0)),
    shareCount: Math.max(0, Math.trunc(stats?.share_count ?? 0)),
    viewCount: Math.max(0, Math.trunc(stats?.play_count ?? stats?.view_count ?? 0))
  });

export const transformDisplayVideo = (
  video: TikTokDisplayVideo,
  accountId: Types.ObjectId,
  now: Date
): VideoUpsertOperation => {
  if (!video.id) {
    throw new Error("TikTok video payload is missing an id");
  }

  const username = video.author?.username ?? null;
  const shareUrl = sanitizeShareUrl(video.share_url ?? video.id, username);
  const metrics = sanitizeDisplayMetrics(video.stats);
  const postedAt = video.create_time ? new Date(video.create_time * 1000) : undefined;
  const embed = sanitizeEmbed(
    shareUrl,
    video.embed_html,
    video.author,
    video.cover_image_url ?? video.video?.cover_image_url
  );

  return {
    filter: { tiktokVideoId: video.id },
    update: {
      $set: {
        ownerTikTokAccountId: accountId,
        shareUrl,
        caption: sanitizeCaption(video.description),
        embed,
        postedAt,
        metrics,
        lastRefreshedAt: now,
        updatedAt: now
      },
      $setOnInsert: {
        tiktokVideoId: video.id,
        ownerTikTokAccountId: accountId,
        createdAt: now
      }
    }
  };
};

export const chunkArray = <T>(values: T[], size: number): T[][] => {
  if (size <= 0) {
    return [values];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }

  return chunks;
};

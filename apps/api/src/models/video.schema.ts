import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { TikTokEmbed } from "@trendpot/types";
import { tikTokEmbedSchema } from "@trendpot/types";
import { HydratedDocument, SchemaTypes } from "mongoose";
import { TikTokAccountEntity } from "./tiktok-account.schema";

interface VideoMetrics {
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
}

const TIKTOK_EMBED_SCRIPT_URL = "https://www.tiktok.com/embed.js";

const sanitizeTikTokShareUrl = (value: string): string => {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") {
      throw new Error("Share URL must use HTTPS.");
    }

    if (!url.hostname.endsWith("tiktok.com") && !url.hostname.endsWith("tiktokshort.com")) {
      throw new Error("Share URL must point to TikTok.");
    }

    return url.toString();
  } catch (error) {
    throw new Error(`Invalid TikTok share URL: ${(error as Error).message}`);
  }
};

const sanitizeTikTokEmbed = (embed: TikTokEmbed): TikTokEmbed => {
  const parsed = tikTokEmbedSchema.parse(embed);
  return {
    provider: parsed.provider,
    html: parsed.html,
    scriptUrl: parsed.scriptUrl ?? TIKTOK_EMBED_SCRIPT_URL,
    width: parsed.width,
    height: parsed.height,
    thumbnailUrl: parsed.thumbnailUrl,
    authorName: parsed.authorName,
    authorUrl: parsed.authorUrl
  };
};

const sanitizeMetrics = (metrics: Partial<VideoMetrics> | undefined): VideoMetrics => {
  return {
    likeCount: Math.max(0, Math.trunc(metrics?.likeCount ?? 0)),
    commentCount: Math.max(0, Math.trunc(metrics?.commentCount ?? 0)),
    shareCount: Math.max(0, Math.trunc(metrics?.shareCount ?? 0)),
    viewCount: Math.max(0, Math.trunc(metrics?.viewCount ?? 0))
  };
};

const sanitizeCaption = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.slice(0, 2200);
};

@Schema({
  collection: "videos",
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class VideoEntity {
  @Prop({ required: true, unique: true, trim: true })
  declare tiktokVideoId: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: TikTokAccountEntity.name, required: true, index: true })
  declare ownerTikTokAccountId: string;

  @Prop({ required: true, trim: true, set: sanitizeTikTokShareUrl })
  declare shareUrl: string;

  @Prop({ required: false, default: null, set: sanitizeCaption })
  declare caption: string | null;

  @Prop({ required: false })
  declare postedAt?: Date;

  @Prop({
    type: {
      provider: { type: String, required: true, default: "tiktok" },
      html: { type: String, required: true },
      scriptUrl: { type: String, required: true, default: TIKTOK_EMBED_SCRIPT_URL },
      width: { type: Number },
      height: { type: Number },
      thumbnailUrl: { type: String },
      authorName: { type: String },
      authorUrl: { type: String }
    },
    required: true,
    _id: false,
    set: sanitizeTikTokEmbed
  })
  declare embed: TikTokEmbed;

  @Prop({
    type: {
      likeCount: { type: Number, default: 0, min: 0 },
      commentCount: { type: Number, default: 0, min: 0 },
      shareCount: { type: Number, default: 0, min: 0 },
      viewCount: { type: Number, default: 0, min: 0 }
    },
    required: true,
    default: {},
    set: sanitizeMetrics
  })
  declare metrics: VideoMetrics;

  @Prop({ required: true })
  declare lastRefreshedAt: Date;
}

export type VideoDocument = HydratedDocument<VideoEntity>;

export const VideoSchema = SchemaFactory.createForClass(VideoEntity);

VideoSchema.virtual("id").get(function (this: VideoEntity & { _id: unknown }) {
  return String((this as { _id: { toString(): string } })._id);
});

VideoSchema.index({ tiktokVideoId: 1 }, { unique: true });
VideoSchema.index({ ownerTikTokAccountId: 1, postedAt: -1 });

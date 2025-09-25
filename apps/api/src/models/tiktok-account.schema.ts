import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import { UserEntity } from "../platform-auth/schemas/user.schema";

interface EncryptedToken {
  keyId: string;
  ciphertext: string;
  iv: string;
  authTag: string;
}

const sanitizeTikTokUsername = (value: string): string => {
  const normalized = value.trim().replace(/^@+/, "");
  if (normalized.length === 0) {
    throw new Error("TikTok username cannot be empty.");
  }

  return normalized.toLowerCase();
};

const sanitizeDisplayName = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const sanitizeAvatarUrl = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") {
      throw new Error("Avatar URL must use HTTPS.");
    }

    if (!url.hostname.includes("tiktok")) {
      throw new Error("Avatar URL must point to a TikTok-controlled domain.");
    }

    return url.toString();
  } catch (error) {
    throw new Error(`Invalid TikTok avatar URL: ${(error as Error).message}`);
  }
};

const normalizeScopes = (value: string[] | undefined): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const scopes = new Set<string>();
  for (const scope of value) {
    if (typeof scope !== "string") {
      continue;
    }

    const trimmed = scope.trim();
    if (trimmed.length > 0) {
      scopes.add(trimmed);
    }
  }

  return Array.from(scopes).sort();
};

@Schema({
  collection: "tiktok_accounts",
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class TikTokAccountEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: UserEntity.name, required: true, index: true })
  declare userId: string;

  @Prop({ required: true, unique: true, trim: true })
  declare openId: string;

  @Prop({ required: true, trim: true, set: sanitizeTikTokUsername })
  declare username: string;

  @Prop({ required: false, default: null, set: sanitizeDisplayName })
  declare displayName: string | null;

  @Prop({ required: false, default: null, set: sanitizeAvatarUrl })
  declare avatarUrl: string | null;

  @Prop({ type: [String], required: true, default: [], set: normalizeScopes })
  declare scopes: string[];

  @Prop({
    type: {
      keyId: { type: String, required: true },
      ciphertext: { type: String, required: true },
      iv: { type: String, required: true },
      authTag: { type: String, required: true }
    },
    required: true
  })
  declare accessToken: EncryptedToken;

  @Prop({
    type: {
      keyId: { type: String, required: true },
      ciphertext: { type: String, required: true },
      iv: { type: String, required: true },
      authTag: { type: String, required: true }
    },
    required: true
  })
  declare refreshToken: EncryptedToken;

  @Prop({ required: true })
  declare accessTokenExpiresAt: Date;

  @Prop({ required: true })
  declare refreshTokenExpiresAt: Date;

  @Prop({
    type: {
      lastVideoSyncAt: { type: Date },
      lastProfileRefreshAt: { type: Date },
      lastMetricsRefreshAt: { type: Date },
      lastMetricsErrorAt: { type: Date }
    },
    required: false,
    default: {}
  })
  declare syncMetadata?: {
    lastVideoSyncAt?: Date;
    lastProfileRefreshAt?: Date;
    lastMetricsRefreshAt?: Date;
    lastMetricsErrorAt?: Date;
  };
}

export type TikTokAccountDocument = HydratedDocument<TikTokAccountEntity>;

export const TikTokAccountSchema = SchemaFactory.createForClass(TikTokAccountEntity);

TikTokAccountSchema.virtual("id").get(function (this: TikTokAccountEntity & { _id: unknown }) {
  return String((this as { _id: { toString(): string } })._id);
});

TikTokAccountSchema.index({ userId: 1 });
TikTokAccountSchema.index({ openId: 1 }, { unique: true });

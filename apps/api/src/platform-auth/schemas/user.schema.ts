import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import type { UserRole } from "@trendpot/types";

export type UserDocument = HydratedDocument<UserEntity>;

@Schema({
  collection: "users",
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class UserEntity {
  @Prop({ required: false, unique: true, lowercase: true, trim: true, sparse: true, default: null })
  declare email: string | null;

  @Prop({ required: false, unique: true, sparse: true, trim: true })
  declare phone?: string;

  @Prop({ required: true, trim: true })
  declare displayName: string;

  @Prop({ required: false, unique: true, sparse: true, trim: true })
  declare tiktokUserId?: string;

  @Prop({ required: false, trim: true })
  declare tiktokUsername?: string;

  @Prop({ required: false, trim: true })
  declare avatarUrl?: string;

  @Prop({ type: [String], required: true, default: [] })
  declare tiktokScopes: string[];

  @Prop({
    type: [String],
    required: true,
    default: ["fan"],
    enum: ["fan", "creator", "operator", "admin"]
  })
  declare roles: UserRole[];

  @Prop({
    required: true,
    lowercase: true,
    trim: true,
    enum: ["active", "disabled", "pending_verification"],
    default: "pending_verification"
  })
  declare status: "active" | "disabled" | "pending_verification";

  @Prop({ type: SchemaTypes.Mixed })
  declare metadata?: Record<string, unknown>;

  @Prop({
    type: {
      lastLoginAt: Date
    },
    default: {}
  })
  declare audit?: {
    lastLoginAt?: Date;
  };

  @Prop({
    type: {
      keyId: String,
      accessToken: String,
      accessTokenIv: String,
      accessTokenTag: String,
      refreshToken: String,
      refreshTokenIv: String,
      refreshTokenTag: String,
      accessTokenExpiresAt: Date,
      refreshTokenExpiresAt: Date,
      scope: [String]
    },
    required: false,
    default: null
  })
  declare tiktokAuth?: {
    keyId: string;
    accessToken: string;
    accessTokenIv: string;
    accessTokenTag: string;
    refreshToken: string;
    refreshTokenIv: string;
    refreshTokenTag: string;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
    scope: string[];
  } | null;
}

export const UserSchema = SchemaFactory.createForClass(UserEntity);

UserSchema.virtual("id").get(function (this: UserEntity & { _id: unknown }) {
  return String((this as { _id: { toString(): string } })._id);
});

UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ phone: 1 }, { unique: true, sparse: true });
UserSchema.index({ tiktokUserId: 1 }, { unique: true, sparse: true });

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
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  declare email: string;

  @Prop({ required: false, unique: true, sparse: true, trim: true })
  declare phone?: string;

  @Prop({ required: true, trim: true })
  declare displayName: string;

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
      lastLoginAt: Date,
      lastOtpAt: Date,
      lastOtpIpAddress: String,
      lastOtpUserAgent: String
    },
    default: {}
  })
  declare audit?: {
    lastLoginAt?: Date;
    lastOtpAt?: Date;
    lastOtpIpAddress?: string;
    lastOtpUserAgent?: string;
  };
}

export const UserSchema = SchemaFactory.createForClass(UserEntity);

UserSchema.virtual("id").get(function (this: UserEntity & { _id: unknown }) {
  return String((this as { _id: { toString(): string } })._id);
});

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ phone: 1 }, { unique: true, sparse: true });

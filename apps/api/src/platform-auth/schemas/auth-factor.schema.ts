import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";

export type AuthFactorDocument = HydratedDocument<AuthFactorEntity>;

@Schema({
  collection: "auth_factors",
  timestamps: true
})
export class AuthFactorEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: "UserEntity", required: true })
  declare userId: string;

  @Prop({
    required: true,
    enum: ["email_otp", "magic_link"],
    default: "email_otp"
  })
  declare type: "email_otp" | "magic_link";

  @Prop({
    required: true,
    enum: ["email", "phone"],
    default: "email"
  })
  declare channel: "email" | "phone";

  @Prop({ required: true })
  declare secretHash: string;

  @Prop({ required: true, default: 0 })
  declare attempts: number;

  @Prop({ required: true })
  declare expiresAt: Date;

  @Prop({
    required: true,
    enum: ["active", "consumed", "expired", "revoked"],
    default: "active"
  })
  declare status: "active" | "consumed" | "expired" | "revoked";
}

export const AuthFactorSchema = SchemaFactory.createForClass(AuthFactorEntity);

AuthFactorSchema.index({ userId: 1, type: 1, channel: 1 });
AuthFactorSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

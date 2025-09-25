import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import type { UserRole } from "@trendpot/types";

export type SessionDocument = HydratedDocument<SessionEntity>;

@Schema({
  collection: "sessions",
  timestamps: false
})
export class SessionEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: "UserEntity", required: true })
  declare userId: string;

  @Prop({ type: [String], required: true })
  declare rolesSnapshot: UserRole[];

  @Prop({ required: true })
  declare issuedAt: Date;

  @Prop({ required: true })
  declare expiresAt: Date;

  @Prop({ required: true, unique: true })
  declare refreshTokenHash: string;

  @Prop({ required: false })
  declare ipAddress?: string;

  @Prop({ required: false })
  declare userAgent?: string;

  @Prop({
    required: true,
    enum: ["active", "revoked", "expired"],
    default: "active"
  })
  declare status: "active" | "revoked" | "expired";

  @Prop({
    type: {
      device: String,
      riskLevel: {
        type: String,
        enum: ["low", "medium", "high"],
        default: "low"
      }
    },
    default: { riskLevel: "low" }
  })
  declare metadata?: {
    device?: string;
    riskLevel?: "low" | "medium" | "high";
  };
}

export const SessionSchema = SchemaFactory.createForClass(SessionEntity);

SessionSchema.index({ userId: 1, issuedAt: -1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

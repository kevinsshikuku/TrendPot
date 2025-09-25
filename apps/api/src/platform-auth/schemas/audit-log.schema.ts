import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import type { AuditLogAction, AuditLogSeverity, UserRole } from "@trendpot/types";

export type AuditLogDocument = HydratedDocument<AuditLogEntity>;

@Schema({
  collection: "audit_logs",
  timestamps: { createdAt: true, updatedAt: false }
})
export class AuditLogEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: "UserEntity", required: false })
  declare actorId?: string;

  @Prop({ type: [String], required: true, default: [] })
  declare actorRoles: UserRole[];

  @Prop({ required: true })
  declare action: AuditLogAction;

  @Prop({ required: false })
  declare targetId?: string;

  @Prop({
    type: {
      requestId: String,
      ipAddress: String,
      userAgent: String,
      summary: String
    },
    default: {}
  })
  declare context?: {
    requestId?: string;
    ipAddress?: string;
    userAgent?: string;
    summary?: string;
  };

  @Prop({
    required: true,
    enum: ["info", "warning", "critical"],
    default: "info"
  })
  declare severity: AuditLogSeverity;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLogEntity);

AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ "context.summary": "text" });

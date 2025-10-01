import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type AuditLogDocument = HydratedDocument<AuditLogEntity>;

@Schema({
  collection: "audit_logs",
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class AuditLogEntity {
  @Prop({ required: true, trim: true })
  declare eventType: string;

  @Prop({ required: true, trim: true })
  declare actorType: string;

  @Prop({ required: false, trim: true })
  declare actorId?: string;

  @Prop({ required: true, trim: true })
  declare outcome: string;

  @Prop({ required: true, trim: true })
  declare resourceType: string;

  @Prop({ required: false, trim: true })
  declare resourceId?: string;

  @Prop({ type: Object, required: false })
  declare metadata?: Record<string, unknown>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLogEntity);

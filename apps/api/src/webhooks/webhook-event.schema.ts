import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type WebhookEventDocument = HydratedDocument<WebhookEventEntity>;

@Schema({
  collection: "webhook_events",
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class WebhookEventEntity {
  @Prop({ required: true, trim: true })
  declare source: string;

  @Prop({ required: true, trim: true })
  declare eventType: string;

  @Prop({ required: false, trim: true })
  declare requestId?: string;

  @Prop({ required: false, trim: true })
  declare checkoutRequestId?: string;

  @Prop({ type: Object })
  declare payload: unknown;

  @Prop({ type: Object })
  declare headers: Record<string, unknown>;

  @Prop({ required: true })
  declare verificationPassed: boolean;

  @Prop({ required: false, trim: true })
  declare verificationFailureReason?: string;
}

export const WebhookEventSchema = SchemaFactory.createForClass(WebhookEventEntity);

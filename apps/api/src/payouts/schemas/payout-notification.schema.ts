import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import { UserEntity } from "../../platform-auth/schemas/user.schema";
import { PayoutNotificationType } from "../models/payout-notification-type.enum";

@Schema({
  collection: "payout_notifications",
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class PayoutNotificationEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: UserEntity.name, required: true, index: true })
  declare userId: string;

  @Prop({ type: String, required: true, enum: PayoutNotificationType })
  declare type: PayoutNotificationType;

  @Prop({ type: String, required: true })
  declare message: string;

  @Prop({ type: SchemaTypes.Date, required: true })
  declare eventAt: Date;

  @Prop({ type: SchemaTypes.Date, required: false, default: null })
  declare readAt?: Date | null;

  @Prop({ type: SchemaTypes.Mixed, required: false })
  declare metadata?: Record<string, unknown>;
}

export type PayoutNotificationDocument = HydratedDocument<PayoutNotificationEntity>;

export const PayoutNotificationSchema = SchemaFactory.createForClass(PayoutNotificationEntity);

PayoutNotificationSchema.virtual("id").get(function (this: PayoutNotificationEntity & { _id: unknown }) {
  return String((this as { _id: { toString(): string } })._id);
});

PayoutNotificationSchema.index({ userId: 1, eventAt: -1, _id: -1 });
PayoutNotificationSchema.index({ userId: 1, readAt: 1, eventAt: -1 });

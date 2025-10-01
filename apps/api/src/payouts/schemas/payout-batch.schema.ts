import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import { UserEntity } from "../../platform-auth/schemas/user.schema";
import { PayoutBatchStatus } from "../models/payout-batch-status.enum";

@Schema({
  collection: "payout_batches",
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class PayoutBatchEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: UserEntity.name, required: true, index: true })
  declare creatorUserId: string;

  @Prop({ type: SchemaTypes.Date, required: true })
  declare scheduledFor: Date;

  @Prop({ type: SchemaTypes.Date, required: false })
  declare startedAt?: Date;

  @Prop({ type: SchemaTypes.Date, required: false })
  declare completedAt?: Date;

  @Prop({ type: SchemaTypes.Date, required: false })
  declare periodStart?: Date;

  @Prop({ type: SchemaTypes.Date, required: false })
  declare periodEnd?: Date;

  @Prop({ type: Number, required: true, min: 0 })
  declare totalAmountCents: number;

  @Prop({ type: Number, required: true, min: 0 })
  declare netAmountCents: number;

  @Prop({ type: Number, required: true, min: 0 })
  declare donationCount: number;

  @Prop({ type: String, required: true, minlength: 3, maxlength: 3, uppercase: true })
  declare currency: string;

  @Prop({ type: String, required: true, enum: PayoutBatchStatus, default: PayoutBatchStatus.Scheduled })
  declare status: PayoutBatchStatus;

  @Prop({ type: String, required: false })
  declare failureReason?: string;
}

export type PayoutBatchDocument = HydratedDocument<PayoutBatchEntity>;

export const PayoutBatchSchema = SchemaFactory.createForClass(PayoutBatchEntity);

PayoutBatchSchema.virtual("id").get(function (this: PayoutBatchEntity & { _id: unknown }) {
  return String((this as { _id: { toString(): string } })._id);
});

PayoutBatchSchema.index({ creatorUserId: 1, scheduledFor: -1, _id: -1 });
PayoutBatchSchema.index({ creatorUserId: 1, status: 1, scheduledFor: -1 });

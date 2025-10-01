import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { DonationStatus } from "./donation-status.enum";

export type DonationDocument = HydratedDocument<DonationEntity>;

@Schema({
  collection: "donations",
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class DonationEntity {
  @Prop({ type: Types.ObjectId, ref: "submissions", required: false })
  declare submissionId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "users", required: false })
  declare donorUserId?: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  declare amountCents: number;

  @Prop({ required: true, enum: DonationStatus, default: DonationStatus.Pending })
  declare status: DonationStatus;

  @Prop({ required: true, unique: true, index: true })
  declare mpesaCheckoutRequestId: string;

  @Prop({ required: false })
  declare merchantRequestId?: string;

  @Prop({ required: false })
  declare accountReference?: string;

  @Prop({ required: false })
  declare mpesaReceipt?: string;

  @Prop({ required: false })
  declare payerPhone?: string;

  @Prop({ required: false, type: Date })
  declare transactionCompletedAt?: Date;

  @Prop({ required: false })
  declare resultCode?: number;

  @Prop({ required: false })
  declare resultDescription?: string;

  @Prop({ required: false, type: Object })
  declare rawCallback?: Record<string, unknown>;

  @Prop({ required: false, type: Date })
  declare lastCallbackAt?: Date;
}

export const DonationSchema = SchemaFactory.createForClass(DonationEntity);

DonationSchema.index({ mpesaCheckoutRequestId: 1 }, { unique: true });

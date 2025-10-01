import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";

export enum DonationStatus {
  Pending = "pending",
  Submitted = "submitted",
  Paid = "paid",
  Failed = "failed"
}

@Schema({ _id: false })
export class DonationStatusHistoryEntry {
  @Prop({
    required: true,
    enum: ["pending", "submitted", "paid", "failed"],
    lowercase: true,
    trim: true,
    type: String
  })
  declare status: DonationStatus;

  @Prop({ required: true })
  declare occurredAt: Date;

  @Prop({ required: false, trim: true })
  declare description?: string | null;
}

const DonationStatusHistorySchema = SchemaFactory.createForClass(DonationStatusHistoryEntry);

export type DonationDocument = HydratedDocument<DonationEntity>;

@Schema({
  collection: "donations",
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class DonationEntity {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  declare submissionId: SchemaTypes.ObjectId | string;

  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  declare donorUserId: SchemaTypes.ObjectId | string;

  @Prop({ required: true, min: 1 })
  declare amountCents: number;

  @Prop({ required: true, uppercase: true, length: 3, default: "KES" })
  declare currency: string;

  @Prop({
    required: true,
    enum: ["pending", "submitted", "paid", "failed"],
    lowercase: true,
    trim: true,
    default: DonationStatus.Pending
  })
  declare status: DonationStatus;

  @Prop({ type: [DonationStatusHistorySchema], required: true, default: [] })
  declare statusHistory: DonationStatusHistoryEntry[];

  @Prop({ required: true, unique: true, index: true })
  declare idempotencyKeyHash: string;

  @Prop({ required: false, unique: true, sparse: true })
  declare mpesaCheckoutRequestId?: string | null;

  @Prop({ required: false, unique: true, sparse: true })
  declare mpesaMerchantRequestId?: string | null;

  @Prop({ required: false, trim: true })
  declare failureReason?: string | null;

  @Prop({ required: false, trim: true })
  declare lastResponseDescription?: string | null;

  @Prop({ required: false, trim: true })
  declare accountReference?: string | null;
}

export const DonationSchema = SchemaFactory.createForClass(DonationEntity);

DonationSchema.virtual("id").get(function (this: DonationEntity & { _id: unknown }) {
  return String((this as { _id: { toString(): string } })._id);
});

DonationSchema.index({ idempotencyKeyHash: 1 }, { unique: true });
DonationSchema.index({ mpesaCheckoutRequestId: 1 }, { unique: true, sparse: true });
DonationSchema.index({ mpesaMerchantRequestId: 1 }, { unique: true, sparse: true });
DonationSchema.index({ submissionId: 1 });
DonationSchema.index({ donorUserId: 1 });

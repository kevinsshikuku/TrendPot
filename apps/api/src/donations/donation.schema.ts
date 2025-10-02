import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { DonationStatus } from "./donation-status.enum";

export type DonationDocument = HydratedDocument<DonationEntity>;

export interface DonationStatusHistoryEntry {
  status: DonationStatus;
  occurredAt: Date;
  description?: string | null;
}

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

  @Prop({ required: true, default: "KES" })
  declare currency: string;

  @Prop({ required: true, enum: DonationStatus, default: DonationStatus.Pending })
  declare status: DonationStatus;

  @Prop({
    type: [
      {
        status: { type: String, enum: DonationStatus, required: true },
        occurredAt: { type: Date, required: true },
        description: { type: String, required: false }
      }
    ],
    default: []
  })
  declare statusHistory: DonationStatusHistoryEntry[];

  @Prop({ required: false, unique: true, sparse: true })
  declare idempotencyKeyHash?: string;

  @Prop({ required: false, unique: true, sparse: true })
  declare mpesaCheckoutRequestId?: string;

  @Prop({ required: false })
  declare mpesaMerchantRequestId?: string;

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

  @Prop({ required: false })
  declare lastResponseDescription?: string;

  @Prop({ required: false })
  declare failureReason?: string;
}

export const DonationSchema = SchemaFactory.createForClass(DonationEntity);
DonationSchema.index({ mpesaCheckoutRequestId: 1 }, { unique: true, sparse: true });
DonationSchema.index({ idempotencyKeyHash: 1 }, { unique: true, sparse: true });

export { DonationStatus };

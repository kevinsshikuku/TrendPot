import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { SubmissionEntity } from "../models/submission.schema";
import { ChallengeEntity } from "../models/challenge.schema";
import { UserEntity } from "../platform-auth/schemas/user.schema";
import { PayoutBatchEntity } from "../payouts/schemas/payout-batch.schema";
import { JournalEntryEntity } from "../ledger/schemas/journal-entry.schema";
import { PayoutItemEntity } from "../payouts/schemas/payout-item.schema";
import { DonationStatus } from "./donation-status.enum";
import { DonationPayoutState } from "./donation-payout-state.enum";

@Schema({ _id: false })
export class DonationStatusHistoryEntry {
  @Prop({ type: String, enum: DonationStatus, required: true })
  declare status: DonationStatus;

  @Prop({ type: SchemaTypes.Date, required: true })
  declare occurredAt: Date;

  @Prop({ type: String, required: false })
  declare description?: string;
}

const DonationStatusHistoryEntrySchema = SchemaFactory.createForClass(DonationStatusHistoryEntry);

@Schema({
  collection: "donations",
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class DonationEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: SubmissionEntity.name, required: true, index: true })
  declare submissionId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: ChallengeEntity.name, required: true })
  declare challengeId: Types.ObjectId;

  @Prop({ type: String, required: false })
  declare challengeTitle?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: UserEntity.name, required: true, index: true })
  declare creatorUserId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: UserEntity.name, required: true })
  declare donorUserId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  declare amountCents: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  declare platformFeeCents: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  declare creatorShareCents: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  declare platformShareCents: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  declare platformVatCents: number;

  @Prop({ type: String, required: true, minlength: 3, maxlength: 3, uppercase: true })
  declare currency: string;

  @Prop({ type: String, required: true, enum: DonationStatus, default: DonationStatus.Pending })
  declare status: DonationStatus;

  @Prop({ type: String, required: true, enum: DonationPayoutState, default: DonationPayoutState.Unassigned })
  declare payoutState: DonationPayoutState;

  @Prop({ type: SchemaTypes.Date, required: true })
  declare donatedAt: Date;

  @Prop({ type: SchemaTypes.Date, required: false })
  declare availableAt?: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: PayoutBatchEntity.name, required: false, default: null })
  declare payoutBatchId?: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: PayoutItemEntity.name, required: false, default: null })
  declare payoutItemId?: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: JournalEntryEntity.name, required: false })
  declare ledgerJournalEntryId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.Date, required: false })
  declare paidAt?: Date;

  @Prop({ type: String, required: false })
  declare supporterName?: string;

  @Prop({ type: [DonationStatusHistoryEntrySchema], default: [] })
  declare statusHistory: DonationStatusHistoryEntry[];

  @Prop({ type: String, required: false, index: true })
  declare idempotencyKeyHash?: string;

  @Prop({ type: String, required: false, unique: true, sparse: true })
  declare mpesaCheckoutRequestId?: string;

  @Prop({ type: String, required: false })
  declare mpesaMerchantRequestId?: string;

  @Prop({ type: String, required: false })
  declare accountReference?: string;

  @Prop({ type: String, required: false })
  declare mpesaReceipt?: string;

  @Prop({ type: String, required: false })
  declare payerPhone?: string;

  @Prop({ type: SchemaTypes.Date, required: false })
  declare transactionCompletedAt?: Date;

  @Prop({ type: Number, required: false })
  declare resultCode?: number;

  @Prop({ type: String, required: false })
  declare resultDescription?: string;

  @Prop({ type: String, required: false })
  declare failureReason?: string;

  @Prop({ type: String, required: false })
  declare lastResponseDescription?: string;

  @Prop({ type: Object, required: false })
  declare rawCallback?: Record<string, unknown>;

  @Prop({ type: SchemaTypes.Date, required: false })
  declare lastCallbackAt?: Date;
}

export type DonationDocument = HydratedDocument<DonationEntity>;

export const DonationSchema = SchemaFactory.createForClass(DonationEntity);

DonationSchema.virtual("id").get(function (this: DonationEntity & { _id: unknown }) {
  return String((this as { _id: { toString(): string } })._id);
});

DonationSchema.index({ creatorUserId: 1, donatedAt: -1, _id: -1 });
DonationSchema.index({ creatorUserId: 1, status: 1, donatedAt: -1 });
DonationSchema.index({ creatorUserId: 1, payoutState: 1, donatedAt: -1 });
DonationSchema.index({ mpesaCheckoutRequestId: 1 }, { unique: true, sparse: true });
DonationSchema.index({ idempotencyKeyHash: 1 }, { unique: true, sparse: true });
DonationSchema.index({ ledgerJournalEntryId: 1 }, { unique: true, sparse: true });
DonationSchema.index({ payoutItemId: 1 }, { sparse: true });

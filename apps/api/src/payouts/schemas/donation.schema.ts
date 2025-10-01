import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import { SubmissionEntity } from "../../models/submission.schema";
import { UserEntity } from "../../platform-auth/schemas/user.schema";
import { DonationPayoutState } from "../models/donation-payout-state.enum";
import { DonationStatus } from "../models/donation-status.enum";
import { PayoutBatchEntity } from "./payout-batch.schema";

@Schema({
  collection: "donations",
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class DonationEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: UserEntity.name, required: true, index: true })
  declare creatorUserId: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: UserEntity.name, required: true })
  declare donorUserId: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: SubmissionEntity.name, required: true })
  declare submissionId: string;

  @Prop({ type: String, required: true })
  declare challengeId: string;

  @Prop({ type: String, required: false })
  declare challengeTitle?: string;

  @Prop({ type: Number, required: true, min: 0 })
  declare amountCents: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  declare platformFeeCents: number;

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

  @Prop({ type: SchemaTypes.ObjectId, ref: PayoutBatchEntity.name, default: null })
  declare payoutBatchId?: string | null;

  @Prop({ type: String, required: false })
  declare supporterName?: string;
}

export type DonationDocument = HydratedDocument<DonationEntity>;

export const DonationSchema = SchemaFactory.createForClass(DonationEntity);

DonationSchema.virtual("id").get(function (this: DonationEntity & { _id: unknown }) {
  return String((this as { _id: { toString(): string } })._id);
});

DonationSchema.index({ creatorUserId: 1, donatedAt: -1, _id: -1 });
DonationSchema.index({ creatorUserId: 1, status: 1, donatedAt: -1 });
DonationSchema.index({ creatorUserId: 1, payoutState: 1, donatedAt: -1 });

import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { UserEntity } from "../../platform-auth/schemas/user.schema";
import { WalletEntity } from "../../ledger/schemas/wallet.schema";
import { PayoutBatchEntity } from "./payout-batch.schema";
import { PayoutItemStatus } from "../models/payout-item-status.enum";
import { JournalEntryEntity } from "../../ledger/schemas/journal-entry.schema";

@Schema({
  collection: "payout_items",
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class PayoutItemEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: PayoutBatchEntity.name, required: true, index: true })
  declare batchId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: WalletEntity.name, required: true })
  declare walletId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: UserEntity.name, required: true, index: true })
  declare creatorUserId: Types.ObjectId;

  @Prop({ type: [SchemaTypes.ObjectId], ref: "DonationEntity", required: true, default: [] })
  declare donationIds: Types.ObjectId[];

  @Prop({ type: String, required: true })
  declare msisdn: string;

  @Prop({ type: Number, required: true, min: 1 })
  declare amountCents: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  declare feeCents: number;

  @Prop({ type: String, required: true, minlength: 3, maxlength: 3, uppercase: true })
  declare currency: string;

  @Prop({ type: String, required: true, enum: PayoutItemStatus, default: PayoutItemStatus.Pending })
  declare status: PayoutItemStatus;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  declare attemptCount: number;

  @Prop({ type: SchemaTypes.Date, required: false })
  declare lastAttemptAt?: Date;

  @Prop({ type: String, required: false })
  declare mpesaConversationId?: string;

  @Prop({ type: String, required: false })
  declare mpesaOriginatorConversationId?: string;

  @Prop({ type: String, required: false })
  declare mpesaResultCode?: string;

  @Prop({ type: String, required: false })
  declare mpesaResultDescription?: string;

  @Prop({ type: String, required: false })
  declare mpesaReceipt?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: JournalEntryEntity.name, required: false })
  declare ledgerJournalEntryId?: Types.ObjectId;
}

export type PayoutItemDocument = HydratedDocument<PayoutItemEntity>;

export const PayoutItemSchema = SchemaFactory.createForClass(PayoutItemEntity);

PayoutItemSchema.virtual("id").get(function (this: PayoutItemEntity & { _id: unknown }) {
  return String((this as { _id: { toString(): string } })._id);
});

PayoutItemSchema.index({ batchId: 1, status: 1 });
PayoutItemSchema.index({ mpesaConversationId: 1 }, { unique: true, sparse: true });
PayoutItemSchema.index({ mpesaOriginatorConversationId: 1 }, { unique: true, sparse: true });

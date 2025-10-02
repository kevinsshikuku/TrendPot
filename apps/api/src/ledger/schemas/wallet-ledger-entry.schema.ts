import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { WalletEntity } from "./wallet.schema";
import { JournalEntryEntity } from "./journal-entry.schema";

export type WalletLedgerEntryType = "credit" | "debit";

@Schema({ collection: "wallet_ledger_entries", timestamps: { createdAt: true, updatedAt: false } })
export class WalletLedgerEntryEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: WalletEntity.name, required: true })
  declare walletId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: JournalEntryEntity.name, required: true })
  declare journalEntryId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  declare deltaCents: number;

  @Prop({ type: String, required: true, enum: ["credit", "debit"] })
  declare type: WalletLedgerEntryType;

  @Prop({ type: String, required: true })
  declare reason: string;

  @Prop({ type: Object, required: false })
  declare metadata?: Record<string, unknown>;
}

export type WalletLedgerEntryDocument = HydratedDocument<WalletLedgerEntryEntity>;

export const WalletLedgerEntrySchema = SchemaFactory.createForClass(WalletLedgerEntryEntity);

WalletLedgerEntrySchema.index({ walletId: 1, createdAt: -1 });
WalletLedgerEntrySchema.index({ journalEntryId: 1 }, { unique: true });

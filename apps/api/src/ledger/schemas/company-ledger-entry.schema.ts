import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { JournalEntryEntity } from "./journal-entry.schema";

@Schema({ collection: "company_ledger_entries", timestamps: { createdAt: true, updatedAt: false } })
export class CompanyLedgerEntryEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: JournalEntryEntity.name, required: true, unique: true })
  declare journalEntryId: Types.ObjectId;

  @Prop({ type: Number, required: true, default: 0 })
  declare revenueCents: number;

  @Prop({ type: Number, required: true, default: 0 })
  declare vatCents: number;

  @Prop({ type: Number, required: true, default: 0 })
  declare expenseCents: number;

  @Prop({ type: Number, required: true })
  declare cashDeltaCents: number;

  @Prop({ type: String, required: true, minlength: 3, maxlength: 3 })
  declare currency: string;
}

export type CompanyLedgerEntryDocument = HydratedDocument<CompanyLedgerEntryEntity>;

export const CompanyLedgerEntrySchema = SchemaFactory.createForClass(CompanyLedgerEntryEntity);

CompanyLedgerEntrySchema.index({ journalEntryId: 1 }, { unique: true });

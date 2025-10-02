import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type JournalEntryState = "prepared" | "posted" | "voided";

@Schema({ _id: false })
export class JournalEntryLine {
  @Prop({ type: String, required: true })
  declare accountCode: string;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  declare debitCents: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  declare creditCents: number;

  @Prop({ type: Object, required: false })
  declare metadata?: Record<string, unknown>;
}

const JournalEntryLineSchema = SchemaFactory.createForClass(JournalEntryLine);

@Schema({ collection: "journal_entries", timestamps: true })
export class JournalEntryEntity {
  @Prop({ type: String, required: true })
  declare batchId: string;

  @Prop({ type: String, required: true })
  declare eventType: string;

  @Prop({ type: String, required: true })
  declare eventRefId: string;

  @Prop({ type: [JournalEntryLineSchema], required: true, default: [] })
  declare lines: JournalEntryLine[];

  @Prop({ type: String, required: true, minlength: 3, maxlength: 3 })
  declare currency: string;

  @Prop({ type: Date, required: true })
  declare postedAt: Date;

  @Prop({ type: String, required: true, enum: ["prepared", "posted", "voided"], default: "posted" })
  declare state: JournalEntryState;
}

export type JournalEntryDocument = HydratedDocument<JournalEntryEntity>;

export const JournalEntrySchema = SchemaFactory.createForClass(JournalEntryEntity);

JournalEntrySchema.index({ eventType: 1, eventRefId: 1 }, { unique: true });
JournalEntrySchema.index({ batchId: 1 });

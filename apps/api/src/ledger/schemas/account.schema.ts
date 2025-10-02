import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

@Schema({ collection: "accounts", timestamps: true })
export class AccountEntity {
  @Prop({ type: String, required: true, unique: true })
  declare code: string;

  @Prop({ type: String, required: true })
  declare name: string;

  @Prop({ type: String, required: true, enum: ["asset", "liability", "equity", "revenue", "expense"] })
  declare type: AccountType;

  @Prop({ type: Boolean, required: true, default: true })
  declare active: boolean;
}

export type AccountDocument = HydratedDocument<AccountEntity>;

export const AccountSchema = SchemaFactory.createForClass(AccountEntity);

AccountSchema.index({ code: 1 }, { unique: true });

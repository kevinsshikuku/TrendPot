import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes, Types } from "mongoose";
import { UserEntity } from "../../platform-auth/schemas/user.schema";

@Schema({ collection: "wallets", timestamps: true })
export class WalletEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: UserEntity.name, required: true, unique: true })
  declare userId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  declare availableCents: number;

  @Prop({ type: Number, required: true, min: 0, default: 0 })
  declare pendingCents: number;

  @Prop({ type: String, required: true, minlength: 3, maxlength: 3, default: "KES" })
  declare currency: string;
}

export type WalletDocument = HydratedDocument<WalletEntity>;

export const WalletSchema = SchemaFactory.createForClass(WalletEntity);

WalletSchema.index({ userId: 1 }, { unique: true });

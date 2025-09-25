import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type ChallengeDocument = HydratedDocument<ChallengeEntity>;

@Schema({
  collection: "challenges",
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class ChallengeEntity {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  declare slug: string;

  @Prop({ required: true, trim: true })
  declare title: string;

  @Prop({ required: true, trim: true })
  declare tagline: string;

  @Prop({ required: true, trim: true })
  declare description: string;

  @Prop({ required: true, default: 0, min: 0 })
  declare raisedCents: number;

  @Prop({ required: true, min: 1 })
  declare goalCents: number;

  @Prop({ required: true, uppercase: true, length: 3, default: "KES" })
  declare currency: string;

  @Prop({ required: true, lowercase: true, trim: true, default: "draft" })
  declare status: string;
}

export const ChallengeSchema = SchemaFactory.createForClass(ChallengeEntity);

ChallengeSchema.virtual("id").get(function (this: ChallengeEntity & { slug: string }) {
  return this.slug;
});

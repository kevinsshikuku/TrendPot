import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, SchemaTypes } from "mongoose";
import { ChallengeEntity } from "./challenge.schema";
import { SubmissionState } from "./submission-state.enum";
import { VideoEntity } from "./video.schema";
import { UserEntity } from "../platform-auth/schemas/user.schema";

const sanitizeModerationReason = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.slice(0, 500);
};

@Schema({
  collection: "submissions",
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})
export class SubmissionEntity {
  @Prop({ type: SchemaTypes.ObjectId, ref: ChallengeEntity.name, required: true, index: true })
  declare challengeId: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: UserEntity.name, required: true })
  declare creatorUserId: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: VideoEntity.name, required: true })
  declare videoId: string;

  @Prop({ required: true, enum: SubmissionState, default: SubmissionState.Pending })
  declare state: SubmissionState;

  @Prop({ required: false, default: null, set: sanitizeModerationReason })
  declare rejectionReason: string | null;

  @Prop({
    type: {
      decidedAt: { type: Date },
      decidedByUserId: { type: SchemaTypes.ObjectId, ref: UserEntity.name },
      notes: { type: String }
    },
    default: null
  })
  declare moderation?: {
    decidedAt?: Date;
    decidedByUserId?: string;
    notes?: string;
  } | null;
}

export type SubmissionDocument = HydratedDocument<SubmissionEntity>;

export const SubmissionSchema = SchemaFactory.createForClass(SubmissionEntity);

SubmissionSchema.virtual("id").get(function (this: SubmissionEntity & { _id: unknown }) {
  return String((this as { _id: { toString(): string } })._id);
});

SubmissionSchema.index({ challengeId: 1, state: 1, _id: -1 });
SubmissionSchema.index({ creatorUserId: 1, challengeId: 1 });
SubmissionSchema.index({ videoId: 1 });

import { Field, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";
import { SubmissionState } from "./submission-state.enum";
import { VideoModel } from "./video.model";

@ObjectType("Submission")
export class SubmissionModel {
  @Field()
  declare id: string;

  @Field()
  declare challengeId: string;

  @Field()
  declare creatorUserId: string;

  @Field()
  declare videoId: string;

  @Field(() => SubmissionState)
  declare state: SubmissionState;

  @Field({ nullable: true })
  declare rejectionReason?: string | null;

  @Field(() => GraphQLISODateTime)
  declare createdAt: Date;

  @Field(() => GraphQLISODateTime)
  declare updatedAt: Date;

  @Field(() => VideoModel)
  declare video: VideoModel;
}

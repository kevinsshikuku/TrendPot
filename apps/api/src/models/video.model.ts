import { Field, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";
import { TikTokAccountModel } from "./tiktok-account.model";
import { TikTokEmbedModel } from "./tiktok-embed.model";
import { VideoMetricsModel } from "./video-metrics.model";

@ObjectType("Video")
export class VideoModel {
  @Field()
  declare id: string;

  @Field()
  declare tiktokVideoId: string;

  @Field()
  declare ownerAccountId: string;

  @Field()
  declare shareUrl: string;

  @Field({ nullable: true })
  declare caption?: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  declare postedAt?: Date | null;

  @Field(() => TikTokEmbedModel)
  declare embed: TikTokEmbedModel;

  @Field(() => VideoMetricsModel)
  declare metrics: VideoMetricsModel;

  @Field(() => GraphQLISODateTime)
  declare lastRefreshedAt: Date;

  @Field(() => GraphQLISODateTime)
  declare createdAt: Date;

  @Field(() => GraphQLISODateTime)
  declare updatedAt: Date;

  @Field(() => TikTokAccountModel)
  declare owner: TikTokAccountModel;
}

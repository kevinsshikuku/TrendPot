import { Field, Int, ObjectType } from "@nestjs/graphql";

@ObjectType("VideoMetrics")
export class VideoMetricsModel {
  @Field(() => Int)
  declare likeCount: number;

  @Field(() => Int)
  declare commentCount: number;

  @Field(() => Int)
  declare shareCount: number;

  @Field(() => Int)
  declare viewCount: number;
}

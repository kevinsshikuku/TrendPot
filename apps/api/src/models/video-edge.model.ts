import { Field, ObjectType } from "@nestjs/graphql";
import { VideoModel } from "./video.model";

@ObjectType("VideoEdge")
export class VideoEdgeModel {
  @Field()
  declare cursor: string;

  @Field(() => VideoModel)
  declare node: VideoModel;
}

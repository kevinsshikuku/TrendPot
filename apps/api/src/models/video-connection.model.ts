import { Field, ObjectType } from "@nestjs/graphql";
import { VideoEdgeModel } from "./video-edge.model";
import { VideoPageInfoModel } from "./video-page-info.model";

@ObjectType("VideoConnection")
export class VideoConnectionModel {
  @Field(() => [VideoEdgeModel])
  declare edges: VideoEdgeModel[];

  @Field(() => VideoPageInfoModel)
  declare pageInfo: VideoPageInfoModel;
}

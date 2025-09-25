import { Field, ObjectType } from "@nestjs/graphql";

@ObjectType("VideoPageInfo")
export class VideoPageInfoModel {
  @Field({ nullable: true })
  declare endCursor?: string | null;

  @Field()
  declare hasNextPage: boolean;
}

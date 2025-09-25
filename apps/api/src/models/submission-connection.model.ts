import { Field, ObjectType } from "@nestjs/graphql";
import { SubmissionEdgeModel } from "./submission-edge.model";
import { SubmissionPageInfoModel } from "./submission-page-info.model";

@ObjectType("SubmissionConnection")
export class SubmissionConnectionModel {
  @Field(() => [SubmissionEdgeModel])
  declare edges: SubmissionEdgeModel[];

  @Field(() => SubmissionPageInfoModel)
  declare pageInfo: SubmissionPageInfoModel;
}

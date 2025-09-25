import { Field, ObjectType } from "@nestjs/graphql";
import { SubmissionModel } from "./submission.model";

@ObjectType("SubmissionEdge")
export class SubmissionEdgeModel {
  @Field()
  declare cursor: string;

  @Field(() => SubmissionModel)
  declare node: SubmissionModel;
}

import { Field, ObjectType } from "@nestjs/graphql";

@ObjectType("SubmissionPageInfo")
export class SubmissionPageInfoModel {
  @Field({ nullable: true })
  declare endCursor?: string | null;

  @Field()
  declare hasNextPage: boolean;
}

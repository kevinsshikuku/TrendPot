import { Field, ObjectType } from "@nestjs/graphql";

@ObjectType("ConnectionPageInfo")
export class ConnectionPageInfoModel {
  @Field({ nullable: true })
  declare endCursor: string | null;

  @Field()
  declare hasNextPage: boolean;
}

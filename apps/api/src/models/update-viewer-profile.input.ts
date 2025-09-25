import { Field, InputType } from "@nestjs/graphql";

@InputType("UpdateViewerProfileInput")
export class UpdateViewerProfileInputModel {
  @Field({ nullable: true })
  declare displayName?: string;

  @Field({ nullable: true })
  declare phone?: string;
}

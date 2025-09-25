import { Field, InputType } from "@nestjs/graphql";

@InputType("SubmitToChallengeInput")
export class SubmitToChallengeInputModel {
  @Field()
  declare challengeId: string;

  @Field()
  declare tiktokVideoId: string;
}


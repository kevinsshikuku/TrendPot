import { Field, InputType, Int } from "@nestjs/graphql";
import { ChallengeStatus } from "./challenge-status.enum";

@InputType()
export class CreateChallengeInputModel {
  @Field()
  declare id: string;

  @Field()
  declare title: string;

  @Field()
  declare tagline: string;

  @Field()
  declare description: string;

  @Field(() => Int)
  declare goal: number;

  @Field({ nullable: true })
  declare currency?: string;

  @Field(() => ChallengeStatus, { nullable: true })
  declare status?: ChallengeStatus;
}

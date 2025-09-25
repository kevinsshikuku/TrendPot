import { Field, InputType, Int } from "@nestjs/graphql";
import { ChallengeStatus } from "./challenge-status.enum";

@InputType()
export class UpdateChallengeInputModel {
  @Field()
  declare id: string;

  @Field(() => Int)
  declare expectedVersion: number;

  @Field({ nullable: true })
  declare title?: string;

  @Field({ nullable: true })
  declare tagline?: string;

  @Field({ nullable: true })
  declare description?: string;

  @Field(() => Int, { nullable: true })
  declare goal?: number;

  @Field({ nullable: true })
  declare currency?: string;

  @Field(() => ChallengeStatus, { nullable: true })
  declare status?: ChallengeStatus;
}

@InputType()
export class ArchiveChallengeInputModel {
  @Field()
  declare id: string;

  @Field(() => Int)
  declare expectedVersion: number;
}

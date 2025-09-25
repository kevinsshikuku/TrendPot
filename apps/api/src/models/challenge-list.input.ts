import { Field, InputType, Int } from "@nestjs/graphql";
import { ChallengeStatus } from "./challenge-status.enum";

@InputType()
export class ChallengeListFilterInputModel {
  @Field(() => ChallengeStatus, { nullable: true })
  declare status?: ChallengeStatus;

  @Field({ nullable: true })
  declare search?: string;
}

@InputType()
export class ChallengeListInputModel {
  @Field(() => Int, { nullable: true })
  declare first?: number;

  @Field({ nullable: true })
  declare after?: string;

  @Field(() => ChallengeListFilterInputModel, { nullable: true })
  declare filter?: ChallengeListFilterInputModel;
}

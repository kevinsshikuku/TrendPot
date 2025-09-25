import { Field, Int, ObjectType } from "@nestjs/graphql";

@ObjectType("ChallengeSummary")
export class ChallengeSummaryModel {
  @Field()
  declare id: string;

  @Field()
  declare title: string;

  @Field()
  declare tagline: string;

  @Field(() => Int)
  declare raised: number;

  @Field(() => Int)
  declare goal: number;

  @Field()
  declare currency: string;
}

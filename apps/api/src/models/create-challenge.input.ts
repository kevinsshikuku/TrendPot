import { Field, InputType, Int } from "@nestjs/graphql";

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

  @Field({ nullable: true })
  declare status?: string;
}

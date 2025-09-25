import { Field, InputType } from "@nestjs/graphql";
import { IsString, Length, IsOptional, MaxLength } from "class-validator";

@InputType("CompleteTikTokLoginInput")
export class CompleteTikTokLoginInputModel {
  @Field()
  @IsString()
  @Length(1, 512)
  declare code: string;

  @Field()
  @IsString()
  @Length(1, 512)
  declare state: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  declare deviceLabel?: string;
}

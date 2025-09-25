import { Field, InputType } from "@nestjs/graphql";
import { IsOptional, IsString, MaxLength, IsArray } from "class-validator";

@InputType("StartTikTokLoginInput")
export class StartTikTokLoginInputModel {
  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  declare scopes?: string[];

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  declare returnPath?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  declare redirectUri?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  declare deviceLabel?: string;
}

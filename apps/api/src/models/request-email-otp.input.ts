import { Field, InputType } from "@nestjs/graphql";
import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

@InputType("RequestEmailOtpInput")
export class RequestEmailOtpInputModel {
  @Field()
  @IsEmail()
  declare email: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  declare displayName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  declare deviceLabel?: string;
}

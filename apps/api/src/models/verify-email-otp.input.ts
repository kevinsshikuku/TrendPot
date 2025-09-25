import { Field, InputType } from "@nestjs/graphql";
import { IsEmail, IsOptional, IsString, Length } from "class-validator";

@InputType("VerifyEmailOtpInput")
export class VerifyEmailOtpInputModel {
  @Field()
  @IsEmail()
  declare email: string;

  @Field()
  @IsString()
  @Length(6, 6)
  declare otpCode: string;

  @Field()
  @IsString()
  declare token: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  declare deviceLabel?: string;
}

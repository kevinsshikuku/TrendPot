import { Field, InputType, Int } from "@nestjs/graphql";

@InputType("RequestDonationInput")
export class RequestDonationInputModel {
  @Field()
  declare submissionId: string;

  @Field(() => Int)
  declare amountCents: number;

  @Field()
  declare msisdn: string;

  @Field()
  declare idempotencyKey: string;

  @Field({ nullable: true })
  declare accountReference?: string | null;

  @Field({ nullable: true })
  declare narrative?: string | null;
}

import { Field, InputType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";
import { DonationPayoutState } from "../donation-payout-state.enum";
import { DonationStatus } from "../donation-status.enum";

@InputType("AdminDonationFilterInput")
export class AdminDonationFilterInputModel {
  @Field(() => [DonationStatus], { nullable: true })
  declare statuses?: DonationStatus[] | null;

  @Field(() => [DonationPayoutState], { nullable: true })
  declare payoutStates?: DonationPayoutState[] | null;

  @Field({ nullable: true })
  declare creatorUserId?: string | null;

  @Field({ nullable: true })
  declare challengeId?: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  declare donatedAfter?: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  declare donatedBefore?: Date | null;
}

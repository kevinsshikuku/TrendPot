import { Field, ID, Int, ObjectType, registerEnumType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";
import { DonationPayoutState } from "../donation-payout-state.enum";
import { DonationStatus } from "../donation-status.enum";
import { DonationStatusChangeModel } from "./donation-status-change.model";

registerEnumType(DonationStatus, { name: "DonationStatus" });
registerEnumType(DonationPayoutState, { name: "DonationPayoutState" });

@ObjectType("Donation")
export class DonationModel {
  @Field(() => ID)
  declare id: string;

  @Field()
  declare submissionId: string;

  @Field()
  declare challengeId: string;

  @Field()
  declare creatorUserId: string;

  @Field()
  declare donorUserId: string;

  @Field(() => Int)
  declare amountCents: number;

  @Field(() => Int)
  declare platformFeeCents: number;

  @Field(() => Int)
  declare creatorShareCents: number;

  @Field(() => Int)
  declare platformShareCents: number;

  @Field(() => Int)
  declare platformVatCents: number;

  @Field()
  declare currency: string;

  @Field(() => DonationStatus)
  declare status: DonationStatus;

  @Field(() => DonationPayoutState)
  declare payoutState: DonationPayoutState;

  @Field(() => [DonationStatusChangeModel])
  declare statusHistory: DonationStatusChangeModel[];

  @Field({ nullable: true })
  declare mpesaCheckoutRequestId?: string | null;

  @Field({ nullable: true })
  declare mpesaMerchantRequestId?: string | null;

  @Field({ nullable: true })
  declare failureReason?: string | null;

  @Field({ nullable: true })
  declare lastResponseDescription?: string | null;

  @Field({ nullable: true })
  declare accountReference?: string | null;

  @Field(() => GraphQLISODateTime)
  declare createdAt: Date;

  @Field(() => GraphQLISODateTime)
  declare updatedAt: Date;

  @Field(() => Int)
  declare version: number;
}

import { Field, ID, Int, ObjectType, registerEnumType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";
import { DonationStatus } from "../donation.schema";
import { DonationStatusChangeModel } from "./donation-status-change.model";

registerEnumType(DonationStatus, { name: "DonationStatus" });

@ObjectType("Donation")
export class DonationModel {
  @Field(() => ID)
  declare id: string;

  @Field()
  declare submissionId: string;

  @Field()
  declare donorUserId: string;

  @Field(() => Int)
  declare amountCents: number;

  @Field()
  declare currency: string;

  @Field(() => DonationStatus)
  declare status: DonationStatus;

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

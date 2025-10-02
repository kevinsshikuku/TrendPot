import { Field, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";
import { DonationStatus } from "../donation-status.enum";

@ObjectType("DonationStatusChange")
export class DonationStatusChangeModel {
  @Field(() => DonationStatus)
  declare status: DonationStatus;

  @Field(() => GraphQLISODateTime)
  declare occurredAt: Date;

  @Field({ nullable: true })
  declare description?: string | null;
}

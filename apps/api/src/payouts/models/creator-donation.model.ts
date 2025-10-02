import { Field, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";
import { DonationPayoutState } from "./donation-payout-state.enum";
import { DonationStatus } from "./donation-status.enum";
import { ConnectionPageInfoModel } from "./page-info.model";

@ObjectType("CreatorDonation")
export class CreatorDonationModel {
  @Field()
  declare id: string;

  @Field(() => DonationStatus)
  declare status: DonationStatus;

  @Field(() => DonationPayoutState)
  declare payoutState: DonationPayoutState;

  @Field()
  declare amountCents: number;

  @Field()
  declare netAmountCents: number;

  @Field()
  declare currency: string;

  @Field(() => GraphQLISODateTime)
  declare donatedAt: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  declare availableAt?: Date | null;

  @Field({ nullable: true })
  declare supporterName?: string | null;

  @Field({ nullable: true })
  declare challengeTitle?: string | null;

  @Field({ nullable: true })
  declare payoutBatchId?: string | null;

  @Field({ nullable: true })
  declare payoutItemId?: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  declare paidAt?: Date | null;
}

@ObjectType("CreatorDonationEdge")
export class CreatorDonationEdgeModel {
  @Field()
  declare cursor: string;

  @Field(() => CreatorDonationModel)
  declare node: CreatorDonationModel;
}

@ObjectType("CreatorDonationTrendPoint")
export class CreatorDonationTrendPointModel {
  @Field(() => GraphQLISODateTime)
  declare date: Date;

  @Field()
  declare amountCents: number;
}

@ObjectType("CreatorDonationStats")
export class CreatorDonationStatsModel {
  @Field()
  declare lifetimeAmountCents: number;

  @Field()
  declare lifetimeDonationCount: number;

  @Field()
  declare pendingAmountCents: number;

  @Field()
  declare availableAmountCents: number;
}

@ObjectType("CreatorDonationConnection")
export class CreatorDonationConnectionModel {
  @Field(() => [CreatorDonationEdgeModel])
  declare edges: CreatorDonationEdgeModel[];

  @Field(() => ConnectionPageInfoModel)
  declare pageInfo: ConnectionPageInfoModel;

  @Field(() => CreatorDonationStatsModel)
  declare stats: CreatorDonationStatsModel;

  @Field(() => [CreatorDonationTrendPointModel])
  declare trend: CreatorDonationTrendPointModel[];
}

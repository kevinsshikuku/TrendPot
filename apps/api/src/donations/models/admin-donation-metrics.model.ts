import { Field, Int, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";

@ObjectType("AdminDonationTimeBucket")
export class AdminDonationTimeBucketModel {
  @Field(() => GraphQLISODateTime)
  declare start: Date;

  @Field(() => GraphQLISODateTime)
  declare end: Date;

  @Field(() => Int)
  declare amountCents: number;
}

@ObjectType("AdminDonationMetrics")
export class AdminDonationMetricsModel {
  @Field(() => [AdminDonationTimeBucketModel])
  declare dailyTotals: AdminDonationTimeBucketModel[];

  @Field(() => [AdminDonationTimeBucketModel])
  declare weeklyTotals: AdminDonationTimeBucketModel[];

  @Field(() => [AdminDonationTimeBucketModel])
  declare monthlyTotals: AdminDonationTimeBucketModel[];

  @Field(() => Int)
  declare vatCollectedCents: number;

  @Field(() => Int)
  declare pendingPayoutCents: number;

  @Field(() => Int)
  declare outstandingClearingBalanceCents: number;
}

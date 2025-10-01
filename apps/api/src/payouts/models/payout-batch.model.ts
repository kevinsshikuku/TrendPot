import { Field, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";
import { PayoutBatchStatus } from "./payout-batch-status.enum";
import { ConnectionPageInfoModel } from "./page-info.model";

@ObjectType("PayoutBatch")
export class PayoutBatchModel {
  @Field()
  declare id: string;

  @Field(() => PayoutBatchStatus)
  declare status: PayoutBatchStatus;

  @Field(() => GraphQLISODateTime)
  declare scheduledFor: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  declare completedAt?: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  declare startedAt?: Date | null;

  @Field()
  declare donationCount: number;

  @Field()
  declare totalAmountCents: number;

  @Field()
  declare netAmountCents: number;

  @Field()
  declare currency: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  declare periodStart?: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  declare periodEnd?: Date | null;

  @Field({ nullable: true })
  declare failureReason?: string | null;
}

@ObjectType("PayoutBatchEdge")
export class PayoutBatchEdgeModel {
  @Field()
  declare cursor: string;

  @Field(() => PayoutBatchModel)
  declare node: PayoutBatchModel;
}

@ObjectType("PayoutBatchConnection")
export class PayoutBatchConnectionModel {
  @Field(() => [PayoutBatchEdgeModel])
  declare edges: PayoutBatchEdgeModel[];

  @Field(() => ConnectionPageInfoModel)
  declare pageInfo: ConnectionPageInfoModel;
}

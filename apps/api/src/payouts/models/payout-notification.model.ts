import { Field, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";
import { ConnectionPageInfoModel } from "./page-info.model";
import { PayoutNotificationType } from "./payout-notification-type.enum";

@ObjectType("PayoutNotificationMetadata")
export class PayoutNotificationMetadataModel {
  @Field({ nullable: true })
  declare donationId?: string | null;

  @Field({ nullable: true })
  declare payoutBatchId?: string | null;

  @Field({ nullable: true })
  declare amountCents?: number | null;

  @Field({ nullable: true })
  declare currency?: string | null;
}

@ObjectType("PayoutNotification")
export class PayoutNotificationModel {
  @Field()
  declare id: string;

  @Field(() => PayoutNotificationType)
  declare type: PayoutNotificationType;

  @Field()
  declare message: string;

  @Field(() => GraphQLISODateTime)
  declare createdAt: Date;

  @Field(() => GraphQLISODateTime)
  declare eventAt: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  declare readAt?: Date | null;

  @Field(() => PayoutNotificationMetadataModel, { nullable: true })
  declare metadata?: PayoutNotificationMetadataModel | null;
}

@ObjectType("PayoutNotificationEdge")
export class PayoutNotificationEdgeModel {
  @Field()
  declare cursor: string;

  @Field(() => PayoutNotificationModel)
  declare node: PayoutNotificationModel;
}

@ObjectType("PayoutNotificationConnection")
export class PayoutNotificationConnectionModel {
  @Field(() => [PayoutNotificationEdgeModel])
  declare edges: PayoutNotificationEdgeModel[];

  @Field(() => ConnectionPageInfoModel)
  declare pageInfo: ConnectionPageInfoModel;
}

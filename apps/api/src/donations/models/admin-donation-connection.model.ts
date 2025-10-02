import { Field, Int, ObjectType } from "@nestjs/graphql";
import { DonationModel } from "./donation.model";
import { ConnectionPageInfoModel } from "../../payouts/models/page-info.model";

@ObjectType("AdminDonationTotals")
export class AdminDonationTotalsModel {
  @Field(() => Int)
  declare count: number;

  @Field(() => Int)
  declare grossAmountCents: number;

  @Field(() => Int)
  declare platformFeeCents: number;

  @Field(() => Int)
  declare platformShareCents: number;

  @Field(() => Int)
  declare platformVatCents: number;

  @Field(() => Int)
  declare creatorShareCents: number;
}

@ObjectType("AdminDonationEdge")
export class AdminDonationEdgeModel {
  @Field()
  declare cursor: string;

  @Field(() => DonationModel)
  declare node: DonationModel;
}

@ObjectType("AdminDonationConnection")
export class AdminDonationConnectionModel {
  @Field(() => [AdminDonationEdgeModel])
  declare edges: AdminDonationEdgeModel[];

  @Field(() => ConnectionPageInfoModel)
  declare pageInfo: ConnectionPageInfoModel;

  @Field(() => AdminDonationTotalsModel)
  declare totals: AdminDonationTotalsModel;
}

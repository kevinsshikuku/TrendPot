import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { DarajaClient } from "../mpesa/daraja.client";
import { DonationResolver } from "./donation.resolver";
import { DonationService } from "./donation.service";
import { DonationEntity, DonationSchema } from "./donation.schema";

@Module({
  imports: [MongooseModule.forFeature([{ name: DonationEntity.name, schema: DonationSchema }])],
  providers: [DonationService, DonationResolver, DarajaClient],
  exports: [DonationService]
})
export class DonationsModule {}

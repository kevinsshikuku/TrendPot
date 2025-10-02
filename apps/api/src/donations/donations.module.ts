import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { DarajaClient } from "../mpesa/daraja.client";
import { AuditLogService } from "../audit/audit-log.service";
import { DonationResolver } from "./donation.resolver";
import { DonationService } from "./donation.service";
import { DonationEntity, DonationSchema } from "./donation.schema";

@Module({
  imports: [MongooseModule.forFeature([{ name: DonationEntity.name, schema: DonationSchema }])],
  providers: [DonationService, DonationResolver, DarajaClient, AuditLogService],
  exports: [DonationService]
})
export class DonationsModule {}

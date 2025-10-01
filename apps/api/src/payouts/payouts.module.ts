import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PayoutsResolver } from "./payouts.resolver";
import { PayoutsService } from "./payouts.service";
import { DonationEntity, DonationSchema } from "./schemas/donation.schema";
import { PayoutBatchEntity, PayoutBatchSchema } from "./schemas/payout-batch.schema";
import {
  PayoutNotificationEntity,
  PayoutNotificationSchema
} from "./schemas/payout-notification.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DonationEntity.name, schema: DonationSchema },
      { name: PayoutBatchEntity.name, schema: PayoutBatchSchema },
      { name: PayoutNotificationEntity.name, schema: PayoutNotificationSchema }
    ])
  ],
  providers: [PayoutsResolver, PayoutsService],
  exports: [PayoutsService]
})
export class PayoutsModule {}

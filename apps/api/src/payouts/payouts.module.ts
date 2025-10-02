import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PayoutsResolver } from "./payouts.resolver";
import { PayoutsService } from "./payouts.service";
import { PayoutsConfigService } from "./payouts.config";
import { PayoutDisbursementService } from "./services/payout-disbursement.service";
import { DonationEntity, DonationSchema } from "./schemas/donation.schema";
import { PayoutBatchEntity, PayoutBatchSchema } from "./schemas/payout-batch.schema";
import {
  PayoutNotificationEntity,
  PayoutNotificationSchema
} from "./schemas/payout-notification.schema";
import { PayoutItemEntity, PayoutItemSchema } from "./schemas/payout-item.schema";
import { WalletEntity, WalletSchema } from "../ledger/schemas/wallet.schema";
import { LedgerModule } from "../ledger/ledger.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DonationEntity.name, schema: DonationSchema },
      { name: PayoutBatchEntity.name, schema: PayoutBatchSchema },
      { name: PayoutNotificationEntity.name, schema: PayoutNotificationSchema },
      { name: PayoutItemEntity.name, schema: PayoutItemSchema },
      { name: WalletEntity.name, schema: WalletSchema }
    ]),
    LedgerModule
  ],
  providers: [PayoutsResolver, PayoutsService, PayoutsConfigService, PayoutDisbursementService],
  exports: [PayoutsService, PayoutsConfigService, PayoutDisbursementService]
})
export class PayoutsModule {}

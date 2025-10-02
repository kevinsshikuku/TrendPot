import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ChallengeEntity, ChallengeSchema } from "../models/challenge.schema";
import { SubmissionEntity, SubmissionSchema } from "../models/submission.schema";
import { DarajaClient } from "../mpesa/daraja.client";
import { LedgerModule } from "../ledger/ledger.module";
import { DonationResolver } from "./donation.resolver";
import { DonationEntity, DonationSchema } from "./donation.schema";
import { DonationCallbackService } from "./services/donation-callback.service";
import { DonationRequestsService } from "./services/donation-requests.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DonationEntity.name, schema: DonationSchema },
      { name: SubmissionEntity.name, schema: SubmissionSchema },
      { name: ChallengeEntity.name, schema: ChallengeSchema }
    ]),
    LedgerModule
  ],
  providers: [DonationRequestsService, DonationCallbackService, DonationResolver, DarajaClient],
  exports: [DonationRequestsService, DonationCallbackService]
})
export class DonationsModule {}

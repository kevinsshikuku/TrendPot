import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { LedgerConfigService } from "./ledger.config";
import { LedgerSeedService } from "./ledger-seed.service";
import { LedgerService } from "./ledger.service";
import { AccountEntity, AccountSchema } from "./schemas/account.schema";
import { CompanyLedgerEntryEntity, CompanyLedgerEntrySchema } from "./schemas/company-ledger-entry.schema";
import { JournalEntryEntity, JournalEntrySchema } from "./schemas/journal-entry.schema";
import { WalletEntity, WalletSchema } from "./schemas/wallet.schema";
import { WalletLedgerEntryEntity, WalletLedgerEntrySchema } from "./schemas/wallet-ledger-entry.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AccountEntity.name, schema: AccountSchema },
      { name: JournalEntryEntity.name, schema: JournalEntrySchema },
      { name: WalletEntity.name, schema: WalletSchema },
      { name: WalletLedgerEntryEntity.name, schema: WalletLedgerEntrySchema },
      { name: CompanyLedgerEntryEntity.name, schema: CompanyLedgerEntrySchema }
    ])
  ],
  providers: [LedgerConfigService, LedgerService, LedgerSeedService],
  exports: [LedgerConfigService, LedgerService]
})
export class LedgerModule {}

import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { LedgerConfigService } from "./ledger.config";
import { AccountEntity, type AccountDocument } from "./schemas/account.schema";

@Injectable()
export class LedgerSeedService implements OnModuleInit {
  constructor(
    @InjectModel(AccountEntity.name)
    private readonly accountModel: Model<AccountDocument>,
    private readonly config: LedgerConfigService
  ) {}

  async onModuleInit(): Promise<void> {
    const accounts = this.config.getChartOfAccounts();

    for (const account of accounts) {
      await this.accountModel
        .updateOne(
          { code: account.code },
          {
            $set: {
              name: account.name,
              type: account.type,
              active: true
            }
          },
          { upsert: true }
        )
        .exec();
    }
  }
}

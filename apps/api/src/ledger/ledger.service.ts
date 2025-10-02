import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { ClientSession, Model, Types } from "mongoose";
import { LedgerConfigService } from "./ledger.config";
import {
  LEDGER_ACCOUNT_CODES,
  DONATION_SUCCESS_EVENT,
  PAYOUT_DISBURSED_EVENT
} from "./ledger.constants";
import {
  CompanyLedgerEntryEntity,
  type CompanyLedgerEntryDocument
} from "./schemas/company-ledger-entry.schema";
import {
  JournalEntryEntity,
  type JournalEntryDocument
} from "./schemas/journal-entry.schema";
import { WalletEntity, type WalletDocument } from "./schemas/wallet.schema";
import {
  WalletLedgerEntryEntity,
  type WalletLedgerEntryDocument
} from "./schemas/wallet-ledger-entry.schema";

interface RecordDonationSuccessParams {
  session: ClientSession;
  donationId: string;
  amountCents: number;
  creatorShareCents: number;
  commissionNetCents: number;
  vatCents: number;
  creatorUserId: Types.ObjectId;
  currency: string;
  donatedAt: Date;
}

export interface LedgerPostingResult {
  journalEntryId: Types.ObjectId;
  created: boolean;
}

interface RecordPayoutDisbursementParams {
  session: ClientSession;
  payoutItemId: string;
  amountCents: number;
  feeCents: number;
  creatorUserId: Types.ObjectId;
  walletId: Types.ObjectId;
  currency: string;
  disbursedAt: Date;
  receipt?: string;
}

const isDuplicateKeyError = (error: unknown): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
};

@Injectable()
export class LedgerService {
  constructor(
    private readonly config: LedgerConfigService,
    @InjectModel(JournalEntryEntity.name)
    private readonly journalModel: Model<JournalEntryDocument>,
    @InjectModel(WalletEntity.name)
    private readonly walletModel: Model<WalletDocument>,
    @InjectModel(WalletLedgerEntryEntity.name)
    private readonly walletLedgerModel: Model<WalletLedgerEntryDocument>,
    @InjectModel(CompanyLedgerEntryEntity.name)
    private readonly companyLedgerModel: Model<CompanyLedgerEntryDocument>
  ) {}

  async recordDonationSuccess(params: RecordDonationSuccessParams): Promise<LedgerPostingResult> {
    const existing = await this.journalModel
      .findOne({ eventType: DONATION_SUCCESS_EVENT, eventRefId: params.donationId })
      .session(params.session)
      .exec();

    if (existing) {
      return { journalEntryId: existing._id, created: false };
    }

    const currency = params.currency || this.config.getLedgerCurrency();

    try {
      const [journal] = await this.journalModel.create(
        [
          {
            batchId: params.donationId,
            eventType: DONATION_SUCCESS_EVENT,
            eventRefId: params.donationId,
            lines: [
              {
                accountCode: LEDGER_ACCOUNT_CODES.CASH_MPESA_PAYBILL,
                debitCents: params.amountCents,
                creditCents: 0
              },
              {
                accountCode: LEDGER_ACCOUNT_CODES.LIABILITY_CREATORS_PAYABLE,
                debitCents: 0,
                creditCents: params.creatorShareCents
              },
              {
                accountCode: LEDGER_ACCOUNT_CODES.LIABILITY_VAT_OUTPUT,
                debitCents: 0,
                creditCents: params.vatCents
              },
              {
                accountCode: LEDGER_ACCOUNT_CODES.REVENUE_PLATFORM_COMMISSION,
                debitCents: 0,
                creditCents: params.commissionNetCents
              }
            ],
            currency,
            postedAt: params.donatedAt,
            state: "posted"
          }
        ],
        { session: params.session }
      );

      const wallet = await this.walletModel
        .findOneAndUpdate(
          { userId: params.creatorUserId },
          {
            $setOnInsert: {
              currency,
              pendingCents: 0
            },
            $inc: { availableCents: params.creatorShareCents }
          },
          { new: true, upsert: true, session: params.session }
        )
        .exec();

      await this.walletLedgerModel.create(
        [
          {
            walletId: wallet._id,
            journalEntryId: journal._id,
            deltaCents: params.creatorShareCents,
            type: "credit",
            reason: "donation_success"
          }
        ],
        { session: params.session }
      );

      await this.companyLedgerModel.create(
        [
          {
            journalEntryId: journal._id,
            revenueCents: params.commissionNetCents,
            vatCents: params.vatCents,
            expenseCents: 0,
            cashDeltaCents: params.amountCents,
            currency
          }
        ],
        { session: params.session }
      );

      return { journalEntryId: journal._id, created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const existingJournal = await this.journalModel
        .findOne({ eventType: DONATION_SUCCESS_EVENT, eventRefId: params.donationId })
        .session(params.session)
        .exec();

      if (!existingJournal) {
        throw error;
      }

      return { journalEntryId: existingJournal._id, created: false };
    }
  }

  async recordPayoutDisbursement(params: RecordPayoutDisbursementParams): Promise<LedgerPostingResult> {
    const existing = await this.journalModel
      .findOne({ eventType: PAYOUT_DISBURSED_EVENT, eventRefId: params.payoutItemId })
      .session(params.session)
      .exec();

    if (existing) {
      return { journalEntryId: existing._id, created: false };
    }

    const cashOutflowCents = params.amountCents + params.feeCents;

    try {
      const [journal] = await this.journalModel.create(
        [
          {
            batchId: params.payoutItemId,
            eventType: PAYOUT_DISBURSED_EVENT,
            eventRefId: params.payoutItemId,
            lines: [
              {
                accountCode: LEDGER_ACCOUNT_CODES.LIABILITY_CREATORS_PAYABLE,
                debitCents: params.amountCents,
                creditCents: 0
              },
              ...(params.feeCents > 0
                ? [
                    {
                      accountCode: LEDGER_ACCOUNT_CODES.EXPENSE_PAYOUT_FEES,
                      debitCents: params.feeCents,
                      creditCents: 0
                    }
                  ]
                : []),
              {
                accountCode: LEDGER_ACCOUNT_CODES.CASH_MPESA_PAYBILL,
                debitCents: 0,
                creditCents: cashOutflowCents
              }
            ],
            currency: params.currency || this.config.getLedgerCurrency(),
            postedAt: params.disbursedAt,
            state: "posted"
          }
        ],
        { session: params.session }
      );

      const wallet = await this.walletModel
        .findOneAndUpdate(
          { _id: params.walletId },
          {
            $inc: {
              pendingCents: -params.amountCents
            }
          },
          { new: true, session: params.session }
        )
        .exec();

      if (!wallet) {
        throw new Error("Wallet not found when recording payout disbursement.");
      }

      await this.walletLedgerModel.create(
        [
          {
            walletId: wallet._id,
            journalEntryId: journal._id,
            deltaCents: -params.amountCents,
            type: "debit",
            reason: "payout_disbursed",
            metadata: params.receipt ? { receipt: params.receipt } : undefined
          }
        ],
        { session: params.session }
      );

      await this.companyLedgerModel.create(
        [
          {
            journalEntryId: journal._id,
            revenueCents: 0,
            vatCents: 0,
            expenseCents: params.feeCents,
            cashDeltaCents: -cashOutflowCents,
            currency: params.currency || this.config.getLedgerCurrency()
          }
        ],
        { session: params.session }
      );

      return { journalEntryId: journal._id, created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const existingJournal = await this.journalModel
        .findOne({ eventType: PAYOUT_DISBURSED_EVENT, eventRefId: params.payoutItemId })
        .session(params.session)
        .exec();

      if (!existingJournal) {
        throw error;
      }

      return { journalEntryId: existingJournal._id, created: false };
    }
  }
}

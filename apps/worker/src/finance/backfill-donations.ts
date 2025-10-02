import { Types } from "mongoose";
import type { Collection, Document, ModifyResult } from "mongodb";
import { connectMongo } from "../mongo";
import { workerLogger } from "../logger";
import { LEDGER_ACCOUNT_CODES, DONATION_SUCCESS_EVENT } from "../../../apps/api/src/ledger/ledger.constants";

interface DonationDocument extends Document {
  _id: Types.ObjectId;
  amountCents: number;
  creatorShareCents?: number;
  platformShareCents?: number;
  platformVatCents?: number;
  platformFeeCents?: number;
  currency?: string;
  status: string;
  payoutState?: string;
  donatedAt?: Date;
  availableAt?: Date;
  creatorUserId: Types.ObjectId;
  ledgerJournalEntryId?: Types.ObjectId | null;
}

interface WalletDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  availableCents: number;
  pendingCents: number;
  currency: string;
}

interface JournalDocument extends Document {
  _id: Types.ObjectId;
  eventType: string;
  eventRefId: string;
}

type BackfillMode = "shadow" | "audit" | "apply";

interface CliOptions {
  mode: BackfillMode;
  limit: number;
  after?: Date;
  before?: Date;
}

const DEFAULT_LIMIT = 100;
const DEFAULT_COMMISSION_PERCENT = 30;
const DEFAULT_VAT_RATE = 0.16;
const DEFAULT_CURRENCY = "KES";

const scriptLogger = workerLogger.child({ module: "DonationBackfill" });

const parseDateArg = (value: string | undefined): Date | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date provided: ${value}`);
  }
  return parsed;
};

const parseCliOptions = (): CliOptions => {
  const args = process.argv.slice(2);
  let mode: BackfillMode = "shadow";
  let limit = DEFAULT_LIMIT;
  let after: Date | undefined;
  let before: Date | undefined;

  for (const arg of args) {
    if (arg === "--apply" || arg === "--mode=apply") {
      mode = "apply";
    } else if (arg === "--audit" || arg === "--mode=audit") {
      mode = "audit";
    } else if (arg.startsWith("--mode=")) {
      const value = arg.split("=")[1];
      if (value === "shadow" || value === "audit" || value === "apply") {
        mode = value;
      }
    } else if (arg.startsWith("--limit=")) {
      const raw = Number.parseInt(arg.split("=")[1] ?? "", 10);
      if (!Number.isNaN(raw) && raw > 0) {
        limit = raw;
      }
    } else if (arg.startsWith("--after=")) {
      after = parseDateArg(arg.split("=")[1]);
    } else if (arg.startsWith("--before=")) {
      before = parseDateArg(arg.split("=")[1]);
    }
  }

  return { mode, limit, after, before };
};

const getCommissionRate = () => {
  const percentRaw = process.env.DONATION_PLATFORM_COMMISSION_PERCENT;
  const percent = Number.isFinite(Number(percentRaw)) ? Number(percentRaw) : DEFAULT_COMMISSION_PERCENT;
  const clamped = Math.min(Math.max(percent, 0), 100);
  return clamped / 100;
};

const getVatRate = () => {
  const vatRaw = process.env.PLATFORM_VAT_RATE ?? process.env.DONATION_PLATFORM_VAT_RATE;
  const vat = Number(vatRaw);
  if (!Number.isFinite(vat) || vat < 0) {
    return DEFAULT_VAT_RATE;
  }
  return vat;
};

const getLedgerCurrency = () => {
  const currency = process.env.LEDGER_BASE_CURRENCY ?? DEFAULT_CURRENCY;
  const trimmed = currency.trim();
  return trimmed ? trimmed.toUpperCase() : DEFAULT_CURRENCY;
};

const computeDistribution = (amountCents: number) => {
  const commissionRate = getCommissionRate();
  const vatRate = getVatRate();
  const commissionGross = Math.floor(amountCents * commissionRate);
  const vatCents = Math.round((commissionGross * vatRate) / (1 + vatRate));
  const commissionNet = commissionGross - vatCents;
  const creatorShare = amountCents - commissionGross;

  if (creatorShare + commissionNet + vatCents !== amountCents) {
    throw new Error("Distribution components do not sum to the gross amount.");
  }

  return {
    creatorShareCents: creatorShare,
    platformShareCents: commissionNet,
    platformVatCents: vatCents,
    commissionGrossCents: commissionGross
  };
};

const buildDonationFilter = (options: CliOptions) => {
  const filter: Record<string, unknown> = {
    status: "succeeded",
    $or: [
      { ledgerJournalEntryId: { $exists: false } },
      { ledgerJournalEntryId: null },
      { creatorShareCents: { $exists: false } },
      { platformShareCents: { $exists: false } },
      { platformVatCents: { $exists: false } }
    ]
  };

  if (options.after || options.before) {
    filter.donatedAt = {};
    if (options.after) {
      (filter.donatedAt as Record<string, Date>).$gte = options.after;
    }
    if (options.before) {
      (filter.donatedAt as Record<string, Date>).$lte = options.before;
    }
  }

  return filter;
};

const auditDonation = (
  donation: DonationDocument,
  distribution: ReturnType<typeof computeDistribution>,
  journal: JournalDocument | null
) => {
  const discrepancies: string[] = [];

  if (!journal) {
    discrepancies.push("missing_journal");
  }

  if (donation.creatorShareCents !== distribution.creatorShareCents) {
    discrepancies.push("creator_share_mismatch");
  }

  if (donation.platformShareCents !== distribution.platformShareCents) {
    discrepancies.push("platform_share_mismatch");
  }

  if (donation.platformVatCents !== distribution.platformVatCents) {
    discrepancies.push("platform_vat_mismatch");
  }

  return discrepancies;
};

const applyBackfill = async (
  mongoose: typeof import("mongoose"),
  donations: Collection<DonationDocument>,
  wallets: Collection<WalletDocument>,
  walletLedgerEntries: Collection,
  companyLedgerEntries: Collection,
  journals: Collection<JournalDocument>,
  donation: DonationDocument,
  distribution: ReturnType<typeof computeDistribution>,
  baseCurrency: string
) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const donationId = donation._id.toString();
      const existingJournal = await journals.findOne(
        { eventType: DONATION_SUCCESS_EVENT, eventRefId: donationId },
        { session }
      );

      let journalId: Types.ObjectId;
      if (existingJournal) {
        journalId = existingJournal._id as Types.ObjectId;
      } else {
        const insertResult = await journals.insertOne(
          {
            batchId: donationId,
            eventType: DONATION_SUCCESS_EVENT,
            eventRefId: donationId,
            lines: [
              { accountCode: LEDGER_ACCOUNT_CODES.CASH_MPESA_PAYBILL, debitCents: donation.amountCents, creditCents: 0 },
              { accountCode: LEDGER_ACCOUNT_CODES.LIABILITY_CREATORS_PAYABLE, debitCents: 0, creditCents: distribution.creatorShareCents },
              { accountCode: LEDGER_ACCOUNT_CODES.LIABILITY_VAT_OUTPUT, debitCents: 0, creditCents: distribution.platformVatCents },
              { accountCode: LEDGER_ACCOUNT_CODES.REVENUE_PLATFORM_COMMISSION, debitCents: 0, creditCents: distribution.platformShareCents }
            ],
            currency: donation.currency ?? baseCurrency,
            postedAt: donation.donatedAt ?? new Date(),
            state: "posted"
          },
          { session }
        );
        journalId = insertResult.insertedId as Types.ObjectId;
      }

      if (!existingJournal) {
        const walletResult: ModifyResult<WalletDocument> = await wallets.findOneAndUpdate(
          { userId: donation.creatorUserId },
          {
            $setOnInsert: {
              availableCents: 0,
              pendingCents: 0,
              currency: donation.currency ?? baseCurrency
            },
            $inc: { availableCents: distribution.creatorShareCents }
          },
          { upsert: true, returnDocument: "after", session }
        );

        const wallet = (walletResult.value ??
          (walletResult.lastErrorObject?.upsertedId
            ? await wallets.findOne(
                { _id: walletResult.lastErrorObject.upsertedId as Types.ObjectId },
                { session }
              )
            : null)) as WalletDocument | null;

        if (!wallet) {
          throw new Error("Failed to resolve wallet after upsert.");
        }

        await walletLedgerEntries.insertOne(
          {
            walletId: wallet._id,
            journalEntryId: journalId,
            deltaCents: distribution.creatorShareCents,
            type: "credit",
            reason: "donation_success"
          },
          { session }
        );

        await companyLedgerEntries.insertOne(
          {
            journalEntryId: journalId,
            revenueCents: distribution.platformShareCents,
            vatCents: distribution.platformVatCents,
            expenseCents: 0,
            cashDeltaCents: donation.amountCents,
            currency: donation.currency ?? baseCurrency
          },
          { session }
        );
      }

      await donations.updateOne(
        { _id: donation._id },
        {
          $set: {
            creatorShareCents: distribution.creatorShareCents,
            platformShareCents: distribution.platformShareCents,
            platformVatCents: distribution.platformVatCents,
            platformFeeCents: distribution.commissionGrossCents,
            ledgerJournalEntryId: journalId,
            availableAt: donation.availableAt ?? donation.donatedAt ?? new Date()
          }
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
};

export const runDonationBackfill = async () => {
  const options = parseCliOptions();
  const baseCurrency = getLedgerCurrency();
  const mongoose = await connectMongo();
  const db = mongoose.connection.db;

  const donations = db.collection<DonationDocument>("donations");
  const wallets = db.collection<WalletDocument>("wallets");
  const walletLedgerEntries = db.collection("wallet_ledger_entries");
  const companyLedgerEntries = db.collection("company_ledger_entries");
  const journals = db.collection<JournalDocument>("journal_entries");

  const filter = buildDonationFilter(options);
  const cursor = donations
    .find(filter)
    .sort({ donatedAt: 1, _id: 1 })
    .limit(options.limit);

  let processed = 0;
  let updated = 0;
  let auditedMismatches = 0;

  for await (const donation of cursor) {
    processed += 1;
    const distribution = computeDistribution(donation.amountCents);
    const existingJournal = donation.ledgerJournalEntryId
      ? await journals.findOne({ _id: donation.ledgerJournalEntryId as Types.ObjectId })
      : await journals.findOne({ eventType: DONATION_SUCCESS_EVENT, eventRefId: donation._id.toString() });

    if (options.mode === "audit") {
      const mismatches = auditDonation(donation, distribution, existingJournal);
      if (mismatches.length > 0) {
        auditedMismatches += 1;
        scriptLogger.warn(
          {
            event: "donation.backfill.audit_mismatch",
            donationId: donation._id.toString(),
            mismatches
          },
          "Donation requires remediation before enforcement"
        );
      }
      continue;
    }

    if (options.mode === "shadow") {
      scriptLogger.info(
        {
          event: "donation.backfill.shadow",
          donationId: donation._id.toString(),
          creatorShareCents: distribution.creatorShareCents,
          platformShareCents: distribution.platformShareCents,
          platformVatCents: distribution.platformVatCents,
          missingJournal: !existingJournal
        },
        "Shadow donation ledger backfill"
      );
      continue;
    }

    await applyBackfill(
      mongoose,
      donations,
      wallets,
      walletLedgerEntries,
      companyLedgerEntries,
      journals,
      donation,
      distribution,
      baseCurrency
    );

    updated += 1;
  }

  scriptLogger.info(
    {
      event: "donation.backfill.summary",
      mode: options.mode,
      processed,
      updated,
      auditedMismatches
    },
    "Donation backfill complete"
  );
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runDonationBackfill()
    .then(() => process.exit(0))
    .catch((error) => {
      scriptLogger.error({ event: "donation.backfill.failed", message: (error as Error).message }, "Donation backfill failed");
      process.exit(1);
    });
}

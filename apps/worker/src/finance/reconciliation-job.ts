import { Job } from "bullmq";
import { SpanStatusCode } from "@opentelemetry/api";
import type { FinanceReconciliationJob } from "@trendpot/types";
import { FINANCE_RECONCILIATION_QUEUE } from "@trendpot/types";
import { workerLogger } from "../logger";
import { connectMongo } from "../mongo";
import {
  financeReconciliationDiscrepancyCounter,
  financeReconciliationDurationHistogram,
  workerTracer
} from "../telemetry";
import { sendFinanceAlert } from "./alerting";

interface DonationRecord {
  amountCents: number;
  creatorShareCents?: number;
  donatedAt?: Date;
  status: string;
}

interface MpesaStatementRecord {
  type: "donation" | "payout";
  amountCents: number;
  transactionAt?: Date;
  reference?: string;
}

interface PayoutItemRecord {
  amountCents: number;
  feeCents: number;
  status: string;
  completedAt?: Date;
}

interface LedgerJoinRecord {
  cashDeltaCents: number;
  eventType: string;
  postedAt: Date;
}

interface ReconciliationSummary {
  donationTotalCents: number;
  statementDonationCents: number;
  payoutTotalCents: number;
  statementPayoutCents: number;
  ledgerDonationCashCents: number;
  ledgerPayoutCashCents: number;
  discrepancies: string[];
}

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TOLERANCE_CENTS = 200; // KES 2.00 default tolerance

const reconciliationLogger = workerLogger.child({ module: "FinanceReconciliation" });

const parseDate = (value?: string): Date | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeWindow = (job: FinanceReconciliationJob) => {
  const windowEnd = parseDate(job.windowEnd) ?? new Date();
  const lookbackMs = Number(process.env.FINANCE_RECONCILIATION_LOOKBACK_MS ?? DEFAULT_LOOKBACK_MS);
  const windowStart = parseDate(job.windowStart) ?? new Date(windowEnd.getTime() - Math.max(lookbackMs, 60_000));
  return { windowStart, windowEnd };
};

const getTolerance = (job: FinanceReconciliationJob) => {
  if (typeof job.toleranceCents === "number" && Number.isFinite(job.toleranceCents)) {
    return Math.max(0, job.toleranceCents);
  }
  const fromEnv = Number(process.env.FINANCE_RECONCILIATION_TOLERANCE_CENTS ?? DEFAULT_TOLERANCE_CENTS);
  return Number.isFinite(fromEnv) ? Math.max(0, fromEnv) : DEFAULT_TOLERANCE_CENTS;
};

const sumAggregation = (value: Array<{ amount: number }> | undefined): number => {
  if (!Array.isArray(value) || value.length === 0) {
    return 0;
  }
  return value[0]?.amount ?? 0;
};

const sumLedgerAggregation = (value: Array<{ cash: number }> | undefined): number => {
  if (!Array.isArray(value) || value.length === 0) {
    return 0;
  }
  return value[0]?.cash ?? 0;
};

export const createFinanceReconciliationHandler = () => {
  return async (job: Job<FinanceReconciliationJob>) => {
    const { windowStart, windowEnd } = normalizeWindow(job.data);
    const toleranceCents = getTolerance(job.data);
    const span = workerTracer.startSpan("finance.reconciliation", {
      attributes: {
        reason: job.data.reason ?? "scheduled",
        toleranceCents,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString()
      }
    });
    const start = Date.now();

    try {
      const mongoose = await connectMongo();
      const db = mongoose.connection.db;

      const donations = db.collection<DonationRecord>("donations");
      const mpesaStatements = db.collection<MpesaStatementRecord>("mpesa_transactions");
      const payoutItems = db.collection<PayoutItemRecord>("payout_items");
      const companyLedger = db.collection<LedgerJoinRecord & { journalEntryId: unknown }>("company_ledger_entries");

      const [donationTotals, statementDonations, payoutTotals, statementPayouts, ledgerDonations, ledgerPayouts] = await Promise.all([
        donations
          .aggregate<{ amount: number }>([
            {
              $match: {
                status: "succeeded",
                donatedAt: { $gte: windowStart, $lte: windowEnd }
              }
            },
            {
              $group: {
                _id: null,
                amount: { $sum: { $ifNull: ["$amountCents", 0] } }
              }
            }
          ])
          .toArray(),
        mpesaStatements
          .aggregate<{ amount: number }>([
            {
              $match: {
                type: "donation",
                transactionAt: { $gte: windowStart, $lte: windowEnd }
              }
            },
            {
              $group: {
                _id: null,
                amount: { $sum: { $ifNull: ["$amountCents", 0] } }
              }
            }
          ])
          .toArray(),
        payoutItems
          .aggregate<{ amount: number }>([
            {
              $match: {
                status: "succeeded",
                updatedAt: { $gte: windowStart, $lte: windowEnd }
              }
            },
            {
              $group: {
                _id: null,
                amount: {
                  $sum: {
                    $add: [
                      { $ifNull: ["$amountCents", 0] },
                      { $ifNull: ["$feeCents", 0] }
                    ]
                  }
                }
              }
            }
          ])
          .toArray(),
        mpesaStatements
          .aggregate<{ amount: number }>([
            {
              $match: {
                type: "payout",
                transactionAt: { $gte: windowStart, $lte: windowEnd }
              }
            },
            {
              $group: {
                _id: null,
                amount: { $sum: { $ifNull: ["$amountCents", 0] } }
              }
            }
          ])
          .toArray(),
        companyLedger
          .aggregate<{ cash: number }>([
            {
              $lookup: {
                from: "journal_entries",
                localField: "journalEntryId",
                foreignField: "_id",
                as: "journal"
              }
            },
            { $unwind: "$journal" },
            {
              $match: {
                "journal.eventType": "donation.success",
                "journal.postedAt": { $gte: windowStart, $lte: windowEnd }
              }
            },
            {
              $group: {
                _id: null,
                cash: { $sum: { $ifNull: ["$cashDeltaCents", 0] } }
              }
            }
          ])
          .toArray(),
        companyLedger
          .aggregate<{ cash: number }>([
            {
              $lookup: {
                from: "journal_entries",
                localField: "journalEntryId",
                foreignField: "_id",
                as: "journal"
              }
            },
            { $unwind: "$journal" },
            {
              $match: {
                "journal.eventType": "payout.disbursed",
                "journal.postedAt": { $gte: windowStart, $lte: windowEnd }
              }
            },
            {
              $group: {
                _id: null,
                cash: { $sum: { $ifNull: ["$cashDeltaCents", 0] } }
              }
            }
          ])
          .toArray()
      ]);

      const summary: ReconciliationSummary = {
        donationTotalCents: sumAggregation(donationTotals),
        statementDonationCents: sumAggregation(statementDonations),
        payoutTotalCents: sumAggregation(payoutTotals),
        statementPayoutCents: sumAggregation(statementPayouts),
        ledgerDonationCashCents: sumLedgerAggregation(ledgerDonations),
        ledgerPayoutCashCents: sumLedgerAggregation(ledgerPayouts),
        discrepancies: []
      };

      const discrepancies: Array<{ type: string; delta: number }> = [];

      const donationDelta = summary.donationTotalCents - summary.statementDonationCents;
      if (Math.abs(donationDelta) > toleranceCents) {
        financeReconciliationDiscrepancyCounter.add(1, { type: "donation_statement" });
        discrepancies.push({ type: "donation_statement", delta: donationDelta });
        await sendFinanceAlert({
          event: "finance.reconciliation.donation_mismatch",
          severity: "warning",
          message: "Donation totals do not match M-Pesa statement totals",
          context: {
            deltaCents: donationDelta,
            donationTotalCents: summary.donationTotalCents,
            statementTotalCents: summary.statementDonationCents,
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString()
          }
        });
      }

      const ledgerDonationDelta = summary.donationTotalCents - summary.ledgerDonationCashCents;
      if (Math.abs(ledgerDonationDelta) > toleranceCents) {
        financeReconciliationDiscrepancyCounter.add(1, { type: "donation_ledger" });
        discrepancies.push({ type: "donation_ledger", delta: ledgerDonationDelta });
        await sendFinanceAlert({
          event: "finance.reconciliation.donation_ledger_mismatch",
          severity: "warning",
          message: "Donation totals do not match ledger cash movement",
          context: {
            deltaCents: ledgerDonationDelta,
            donationTotalCents: summary.donationTotalCents,
            ledgerCashCents: summary.ledgerDonationCashCents,
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString()
          }
        });
      }

      const payoutDelta = summary.payoutTotalCents - summary.statementPayoutCents;
      if (Math.abs(payoutDelta) > toleranceCents) {
        financeReconciliationDiscrepancyCounter.add(1, { type: "payout_statement" });
        discrepancies.push({ type: "payout_statement", delta: payoutDelta });
        await sendFinanceAlert({
          event: "finance.reconciliation.payout_mismatch",
          severity: "warning",
          message: "Payout totals do not match M-Pesa payout statements",
          context: {
            deltaCents: payoutDelta,
            payoutTotalCents: summary.payoutTotalCents,
            statementTotalCents: summary.statementPayoutCents,
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString()
          }
        });
      }

      const ledgerPayoutDelta = summary.payoutTotalCents + summary.ledgerPayoutCashCents;
      if (Math.abs(ledgerPayoutDelta) > toleranceCents) {
        financeReconciliationDiscrepancyCounter.add(1, { type: "payout_ledger" });
        discrepancies.push({ type: "payout_ledger", delta: ledgerPayoutDelta });
        await sendFinanceAlert({
          event: "finance.reconciliation.payout_ledger_mismatch",
          severity: "critical",
          message: "Ledger payout cash movement does not match disbursements",
          context: {
            deltaCents: ledgerPayoutDelta,
            payoutTotalCents: summary.payoutTotalCents,
            ledgerCashCents: summary.ledgerPayoutCashCents,
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString()
          }
        });
      }

      summary.discrepancies = discrepancies.map((entry) => entry.type);

      const duration = Date.now() - start;
      financeReconciliationDurationHistogram.record(duration, {
        discrepancies: discrepancies.length
      });
      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttribute("discrepancies.count", discrepancies.length);
      span.setAttribute("summary.donation", summary.donationTotalCents);
      span.setAttribute("summary.payout", summary.payoutTotalCents);

      reconciliationLogger.info(
        {
          event: "finance.reconciliation.completed",
          queue: FINANCE_RECONCILIATION_QUEUE,
          durationMs: duration,
          toleranceCents,
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
          donationTotalCents: summary.donationTotalCents,
          statementDonationCents: summary.statementDonationCents,
          payoutTotalCents: summary.payoutTotalCents,
          statementPayoutCents: summary.statementPayoutCents,
          ledgerDonationCashCents: summary.ledgerDonationCashCents,
          ledgerPayoutCashCents: summary.ledgerPayoutCashCents,
          discrepancies: summary.discrepancies
        },
        "Finance reconciliation job completed"
      );

      return summary;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      reconciliationLogger.error(
        { event: "finance.reconciliation.failed", error: (error as Error).message },
        "Finance reconciliation job failed"
      );
      await sendFinanceAlert({
        event: "finance.reconciliation.failed",
        severity: "critical",
        message: "Finance reconciliation job failed",
        context: { error: (error as Error).message }
      });
      throw error;
    } finally {
      span.end();
    }
  };
};

import { Injectable } from "@nestjs/common";
import {
  DEFAULT_LEDGER_CURRENCY,
  DEFAULT_PLATFORM_COMMISSION_PERCENT,
  DEFAULT_VAT_RATE,
  LEDGER_ACCOUNT_CODES
} from "./ledger.constants";
import type { AccountType } from "./schemas/account.schema";

interface AccountSeed {
  code: string;
  name: string;
  type: AccountType;
}

const clampPercentage = (value: number) => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return DEFAULT_PLATFORM_COMMISSION_PERCENT;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return value;
};

const parsePercentage = (raw: string | undefined): number => {
  if (!raw) {
    return DEFAULT_PLATFORM_COMMISSION_PERCENT;
  }

  const numeric = Number(raw);

  if (Number.isFinite(numeric)) {
    return clampPercentage(numeric);
  }

  return DEFAULT_PLATFORM_COMMISSION_PERCENT;
};

const parseRate = (raw: string | undefined): number => {
  if (!raw) {
    return DEFAULT_VAT_RATE;
  }

  const numeric = Number(raw);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return DEFAULT_VAT_RATE;
  }

  return numeric;
};

const normalizeCurrency = (raw: string | undefined): string => {
  if (!raw) {
    return DEFAULT_LEDGER_CURRENCY;
  }

  const trimmed = raw.trim();

  if (!trimmed) {
    return DEFAULT_LEDGER_CURRENCY;
  }

  return trimmed.toUpperCase();
};

@Injectable()
export class LedgerConfigService {
  private readonly platformCommissionPercent: number;
  private readonly vatRate: number;
  private readonly currency: string;

  constructor() {
    this.platformCommissionPercent = parsePercentage(process.env.DONATION_PLATFORM_COMMISSION_PERCENT);
    this.vatRate = parseRate(process.env.PLATFORM_VAT_RATE ?? process.env.DONATION_PLATFORM_VAT_RATE);
    this.currency = normalizeCurrency(process.env.LEDGER_BASE_CURRENCY);
  }

  getPlatformCommissionPercent(): number {
    return this.platformCommissionPercent;
  }

  getPlatformCommissionRate(): number {
    return this.platformCommissionPercent / 100;
  }

  getVatRate(): number {
    return this.vatRate;
  }

  getLedgerCurrency(): string {
    return this.currency;
  }

  getChartOfAccounts(): AccountSeed[] {
    return [
      { code: LEDGER_ACCOUNT_CODES.CASH_MPESA_PAYBILL, name: "Cash:MpesaPaybill", type: "asset" },
      { code: LEDGER_ACCOUNT_CODES.CLEARING_MPESA_PENDING, name: "Clearing:MpesaPending", type: "asset" },
      { code: LEDGER_ACCOUNT_CODES.LIABILITY_CREATORS_PAYABLE, name: "Liability:CreatorsPayable", type: "liability" },
      { code: LEDGER_ACCOUNT_CODES.LIABILITY_VAT_OUTPUT, name: "Liability:TaxesPayable:VATOutput", type: "liability" },
      { code: LEDGER_ACCOUNT_CODES.LIABILITY_WITHHOLDING, name: "Liability:WithholdingPayable", type: "liability" },
      { code: LEDGER_ACCOUNT_CODES.REVENUE_PLATFORM_COMMISSION, name: "Revenue:PlatformCommission", type: "revenue" },
      { code: LEDGER_ACCOUNT_CODES.EXPENSE_PAYMENT_PROCESSING, name: "Expense:PaymentProcessingFees", type: "expense" },
      { code: LEDGER_ACCOUNT_CODES.EXPENSE_PAYOUT_FEES, name: "Expense:PayoutFees", type: "expense" },
      { code: LEDGER_ACCOUNT_CODES.EQUITY_RETAINED_EARNINGS, name: "Equity:RetainedEarnings", type: "equity" }
    ];
  }
}

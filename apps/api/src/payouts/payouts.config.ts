import { Injectable } from "@nestjs/common";

const DEFAULT_MINIMUM_PAYOUT_CENTS = 5_000; // KES 50
const DEFAULT_PAYOUT_HOLD_HOURS = 24;
const DEFAULT_MAX_ATTEMPTS = 5;

const parseIntEnv = (value: string | undefined, fallback: number, min = 0): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.max(min, parsed);
};

@Injectable()
export class PayoutsConfigService {
  private readonly minimumPayoutCents: number;
  private readonly payoutHoldHours: number;
  private readonly maxDisbursementAttempts: number;

  constructor() {
    this.minimumPayoutCents = parseIntEnv(
      process.env.PAYOUT_MINIMUM_AMOUNT_CENTS,
      DEFAULT_MINIMUM_PAYOUT_CENTS,
      1
    );
    this.payoutHoldHours = parseIntEnv(process.env.PAYOUT_HOLD_HOURS, DEFAULT_PAYOUT_HOLD_HOURS, 0);
    this.maxDisbursementAttempts = parseIntEnv(
      process.env.PAYOUT_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS,
      1
    );
  }

  getMinimumPayoutCents(): number {
    return this.minimumPayoutCents;
  }

  getPayoutHoldDurationMs(): number {
    return this.payoutHoldHours * 60 * 60 * 1000;
  }

  getMaxDisbursementAttempts(): number {
    return this.maxDisbursementAttempts;
  }
}

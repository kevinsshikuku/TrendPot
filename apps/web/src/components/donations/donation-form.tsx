"use client";

import { useMemo, useState } from "react";
import { Button, Card, CardContent, CardFooter, CardHeader, Input, Label } from "@trendpot/ui";
import { formatCurrencyFromCents } from "../../lib/money";

const MIN_DONATION_CENTS = 5000; // 50 KES
const DEFAULT_PRESET_AMOUNTS = [50000, 100000, 250000];

export interface DonationFormSubmission {
  amountCents: number;
  phoneNumber: string;
  idempotencyKey: string;
  donorDisplayName?: string;
}

export interface DonationFormValidationResult {
  amount?: string;
  phoneNumber?: string;
  idempotencyKey?: string;
}

export interface DonationFormProps {
  challengeTitle: string;
  currency: string;
  presetAmounts?: number[];
  onSubmit: (submission: DonationFormSubmission) => void;
  isSubmitting?: boolean;
  disabled?: boolean;
  defaultPhoneNumber?: string;
  defaultIdempotencyKey?: string;
  serverError?: string | null;
}

export const generateIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `donation-${Math.random().toString(36).slice(2, 12)}`;
};

export const validateDonationForm = (
  input: Partial<DonationFormSubmission> & { amountCents?: number | null }
): DonationFormValidationResult => {
  const errors: DonationFormValidationResult = {};

  if (!input.amountCents || input.amountCents < MIN_DONATION_CENTS) {
    errors.amount = "Minimum donation is KES 50.";
  }

  if (!input.phoneNumber || !/^\+?[1-9][0-9]{7,14}$/.test(input.phoneNumber)) {
    errors.phoneNumber = "Enter a valid M-Pesa phone number in E.164 format.";
  }

  if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
    errors.idempotencyKey = "Add an idempotency key with at least 8 characters.";
  }

  return errors;
};

export function DonationForm({
  challengeTitle,
  currency,
  presetAmounts = DEFAULT_PRESET_AMOUNTS,
  onSubmit,
  isSubmitting = false,
  disabled = false,
  defaultPhoneNumber = "",
  defaultIdempotencyKey = generateIdempotencyKey(),
  serverError
}: DonationFormProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(presetAmounts[0] ?? null);
  const [customAmountValue, setCustomAmountValue] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(defaultPhoneNumber);
  const [idempotencyKey, setIdempotencyKey] = useState(defaultIdempotencyKey);
  const [donorDisplayName, setDonorDisplayName] = useState("");
  const [errors, setErrors] = useState<DonationFormValidationResult>({});

  const formattedPresetAmounts = useMemo(
    () => presetAmounts.map((amount) => ({ amount, label: formatCurrencyFromCents(amount, currency) })),
    [presetAmounts, currency]
  );

  const resolvedAmountCents = useMemo(() => {
    if (customAmountValue.trim().length > 0) {
      const parsed = Number.parseFloat(customAmountValue);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.round(parsed * 100);
      }
      return null;
    }

    return selectedAmount;
  }, [customAmountValue, selectedAmount]);

  const handlePresetClick = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmountValue("");
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validation = validateDonationForm({
      amountCents: resolvedAmountCents,
      phoneNumber,
      idempotencyKey
    });

    setErrors(validation);

    if (Object.keys(validation).length > 0) {
      return;
    }

    onSubmit({
      amountCents: resolvedAmountCents!,
      phoneNumber,
      idempotencyKey,
      donorDisplayName: donorDisplayName.trim().length > 0 ? donorDisplayName.trim() : undefined
    });
  };

  return (
    <Card data-testid="donation-form-card" className="h-full">
      <form onSubmit={handleSubmit} className="flex h-full flex-col">
        <CardHeader>
          <div className="flex flex-col gap-1">
            <p className="text-sm uppercase tracking-wide text-emerald-400">Support this creator</p>
            <h2 className="text-2xl font-semibold text-slate-100">Donate to {challengeTitle}</h2>
            <p className="text-sm text-slate-400">
              Select a preset amount or enter your own, confirm your M-Pesa number, and approve the STK prompt.
            </p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-6">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-slate-300">Choose an amount</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {formattedPresetAmounts.map(({ amount, label }) => {
                const isSelected = resolvedAmountCents === amount && customAmountValue.trim().length === 0;
                return (
                  <button
                    key={amount}
                    type="button"
                    className={`rounded-2xl border px-4 py-3 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      isSelected
                        ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                        : "border-slate-800 bg-slate-900 text-slate-200 hover:border-emerald-500"
                    }`}
                    onClick={() => handlePresetClick(amount)}
                    data-testid={`preset-amount-${amount}`}
                  >
                    <span className="block text-lg font-semibold">{label}</span>
                    <span className="mt-1 block text-xs text-slate-400">KES {(amount / 100).toLocaleString("en-KE")}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="customAmount">Custom amount (KES)</Label>
              <Input
                id="customAmount"
                inputMode="decimal"
                pattern="[0-9]*"
                placeholder="Enter custom amount"
                value={customAmountValue}
                onChange={(event) => {
                  setCustomAmountValue(event.target.value);
                  setSelectedAmount(null);
                }}
                disabled={disabled || isSubmitting}
                data-testid="custom-amount-input"
              />
              {errors.amount ? (
                <p className="text-sm text-rose-400" data-testid="amount-error">
                  {errors.amount}
                </p>
              ) : null}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="phoneNumber" requiredIndicator>
              Safaricom / M-Pesa number
            </Label>
            <Input
              id="phoneNumber"
              type="tel"
              placeholder="e.g. +254712345678"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              disabled={disabled || isSubmitting}
              data-testid="phone-input"
            />
            {errors.phoneNumber ? (
              <p className="text-sm text-rose-400" data-testid="phone-error">
                {errors.phoneNumber}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="idempotencyKey" requiredIndicator>
              Idempotency key
            </Label>
            <Input
              id="idempotencyKey"
              value={idempotencyKey}
              onChange={(event) => setIdempotencyKey(event.target.value)}
              disabled={disabled || isSubmitting}
              data-testid="idempotency-input"
            />
            {errors.idempotencyKey ? (
              <p className="text-sm text-rose-400" data-testid="idempotency-error">
                {errors.idempotencyKey}
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Prevent duplicate charges by reusing this key if you retry within the minute.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="donorDisplayName">Display name (optional)</Label>
            <Input
              id="donorDisplayName"
              placeholder="How should we credit you?"
              value={donorDisplayName}
              onChange={(event) => setDonorDisplayName(event.target.value)}
              disabled={disabled || isSubmitting}
              data-testid="display-name-input"
            />
            <p className="text-xs text-slate-500">This name appears on your receipt and donor history.</p>
          </div>

          {serverError ? (
            <div className="rounded-xl border border-rose-500/60 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {serverError}
            </div>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            disabled={disabled || isSubmitting}
            className="w-full justify-center"
            aria-live="polite"
            data-testid="submit-donation"
          >
            {isSubmitting ? "Sending STK Push…" : "Send STK Push"}
          </Button>
          <p className="text-center text-xs text-slate-500">
            You will receive a prompt on your phone to authorize the donation.
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

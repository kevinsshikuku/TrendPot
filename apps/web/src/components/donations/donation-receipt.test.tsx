import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";

import type { Donation } from "@trendpot/types";

import { DonationReceipt } from "./donation-receipt";

const baseDonation: Donation = {
  id: "donation-1",
  submissionId: "submission-1",
  amountCents: 75000,
  currency: "KES",
  status: "succeeded",
  phoneNumber: "+254712345678",
  mpesaCheckoutRequestId: "checkout-1",
  mpesaReceipt: "AB123XYZ",
  failureReason: null,
  idempotencyKey: "idem-12345678",
  donorDisplayName: "Amina",
  createdAt: "2024-05-05T12:00:00.000Z",
  updatedAt: "2024-05-05T12:01:00.000Z"
};

test("DonationReceipt renders optimistic state guidance", () => {
  const markup = renderToString(
    <DonationReceipt
      donation={null}
      challengeTitle="Clean Water Challenge"
      fallbackCurrency="KES"
      shareUrl="https://trendpot.app/c/clean-water"
      optimistic
    />
  );

  assert.ok(markup.includes("We’re sending your STK push"));
  assert.ok(markup.includes("Copy link"));
});

test("DonationReceipt layout adapts across breakpoints", () => {
  const desktopMarkup = renderToString(
    <DonationReceipt
      donation={baseDonation}
      challengeTitle="Clean Water Challenge"
      fallbackCurrency="KES"
      shareUrl="https://trendpot.app/c/clean-water"
      layout="desktop"
    />
  );

  assert.ok(desktopMarkup.includes("grid grid-cols-2"));

  const mobileMarkup = renderToString(
    <DonationReceipt
      donation={{ ...baseDonation, status: "failed", failureReason: "Insufficient funds" }}
      challengeTitle="Clean Water Challenge"
      fallbackCurrency="KES"
      layout="mobile"
    />
  );

  assert.ok(mobileMarkup.includes("flex flex-col"));
  assert.ok(mobileMarkup.includes("Insufficient funds"));
});

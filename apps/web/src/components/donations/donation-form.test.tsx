import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";

import { DonationForm, validateDonationForm } from "./donation-form";

test("validateDonationForm enforces minimum fields", () => {
  const result = validateDonationForm({
    amountCents: 1000,
    phoneNumber: "0712345678",
    idempotencyKey: "short"
  });

  assert.equal(result.amount, "Minimum donation is KES 50.");
  assert.equal(result.phoneNumber, "Enter a valid M-Pesa phone number in E.164 format.");
  assert.equal(result.idempotencyKey, "Add an idempotency key with at least 8 characters.");
});

test("DonationForm renders preset amounts and server errors", () => {
  const markup = renderToString(
    <DonationForm
      challengeTitle="Clean Water Challenge"
      currency="KES"
      presetAmounts={[50000, 100000]}
      onSubmit={() => undefined}
      serverError="Profile is incomplete"
    />
  );

  assert.ok(markup.includes("Clean Water Challenge"));
  assert.ok(markup.includes("KES 500"));
  assert.ok(markup.includes("Profile is incomplete"));
});

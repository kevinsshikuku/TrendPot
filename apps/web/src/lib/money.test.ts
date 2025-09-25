import assert from "node:assert/strict";
import test from "node:test";
import { calculateCompletionPercentage, formatCurrencyFromCents } from "./money";

// These tests provide fast feedback for the formatting helpers that power the
// progress UI so we can refactor layouts later without second-guessing the math.
test("formatCurrencyFromCents formats amounts with currency codes", () => {
  const formatted = formatCurrencyFromCents(250000, "KES");
  assert.match(formatted, /2,500/);
  assert.ok(formatted.includes("K"));
});

test("calculateCompletionPercentage guards against divide-by-zero", () => {
  const zeroGoal = calculateCompletionPercentage(100, 0);
  assert.equal(zeroGoal, 0);

  const capped = calculateCompletionPercentage(150, 100);
  assert.equal(capped, 100);
});

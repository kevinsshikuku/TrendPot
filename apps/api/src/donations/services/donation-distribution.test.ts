import assert from "node:assert/strict";
import test from "node:test";
import { DonationCallbackService } from "./donation-callback.service";

class StaticLedgerConfigStub {
  constructor(private readonly commissionRate: number, private readonly vatRate: number) {}

  getPlatformCommissionRate() {
    return this.commissionRate;
  }

  getVatRate() {
    return this.vatRate;
  }
}

const createService = (commissionRate: number, vatRate: number) =>
  new DonationCallbackService(
    { startSession: async () => ({}) } as never,
    {} as never,
    {} as never,
    {} as never,
    new StaticLedgerConfigStub(commissionRate, vatRate) as never
  );

test("computeDistribution balances to gross amount with rounding", () => {
  const service = createService(0.3, 0.16);
  const distribution = (service as unknown as { computeDistribution(amount: number): unknown }).computeDistribution(5_000) as {
    creatorShareCents: number;
    platformShareCents: number;
    platformVatCents: number;
    commissionGrossCents: number;
  };

  assert.equal(distribution.creatorShareCents, 3_500);
  assert.equal(distribution.platformShareCents, 1_293);
  assert.equal(distribution.platformVatCents, 207);
  assert.equal(distribution.commissionGrossCents, 1_500);
  assert.equal(
    distribution.creatorShareCents + distribution.platformShareCents + distribution.platformVatCents,
    5_000
  );
});

test("computeDistribution never allocates fractional cents", () => {
  const service = createService(0.3, 0.16);

  for (let cents = 1; cents <= 199; cents++) {
    const { creatorShareCents, platformShareCents, platformVatCents, commissionGrossCents } = (
      service as unknown as { computeDistribution(amount: number): {
        creatorShareCents: number;
        platformShareCents: number;
        platformVatCents: number;
        commissionGrossCents: number;
      } }
    ).computeDistribution(cents);

    assert.equal(creatorShareCents % 1, 0);
    assert.equal(platformShareCents % 1, 0);
    assert.equal(platformVatCents % 1, 0);
    assert.equal(commissionGrossCents % 1, 0);
    assert.equal(creatorShareCents + platformShareCents + platformVatCents, cents);
  }
});

test("computeDistribution adapts to different rates", () => {
  const service = createService(0.25, 0.08);
  const result = (service as unknown as { computeDistribution(amount: number): {
    creatorShareCents: number;
    platformShareCents: number;
    platformVatCents: number;
    commissionGrossCents: number;
  } }).computeDistribution(10_000);

  assert.equal(result.creatorShareCents, 7_500);
  assert.equal(result.commissionGrossCents, 2_500);
  assert.equal(result.platformVatCents, 185);
  assert.equal(result.platformShareCents, 2_315);
  assert.equal(result.creatorShareCents + result.platformShareCents + result.platformVatCents, 10_000);
});

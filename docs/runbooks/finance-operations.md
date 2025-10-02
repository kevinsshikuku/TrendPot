# Finance operations runbook

This runbook describes the day-two playbooks for the 70/30 donation split, ledger postings, and M-Pesa payouts. Follow these steps before deploying finance changes or when reconciling production data.

## 1. Pre-flight checks
1. Run the finance-focused unit and smoke tests locally to ensure split math, ledger postings, GraphQL resolvers, and the admin dashboards still behave correctly:
   ```bash
   NODE_PATH=./test-shims node --loader ./test-shims/ts-loader.mjs --test apps/api/src/donations/services/donation-distribution.test.ts apps/api/src/ledger/ledger.service.test.ts apps/api/src/donations/donation.resolver.test.ts
   pnpm --filter web run test
   ```
   These suites fail fast if the revenue distribution or admin visibility regresses. 【F:apps/api/src/donations/services/donation-distribution.test.ts†L1-L60】【F:apps/api/src/ledger/ledger.service.test.ts†L1-L160】【F:apps/api/src/donations/donation.resolver.test.ts†L1-L140】【F:apps/web/src/app/admin/admin-smoke.test.tsx†L1-L86】
2. Confirm finance configuration (`DONATION_PLATFORM_COMMISSION_PERCENT`, `PLATFORM_VAT_RATE`, `LEDGER_BASE_CURRENCY`) is correct for the environment.

## 2. Donation ledger backfill
1. **Shadow run:** simulate the impact without writing anything.
   ```bash
   pnpm --filter worker run backfill:donations --mode=shadow --limit=200 --after=2024-01-01
   ```
   The worker logs the expected creator/platform splits and highlights missing journals. 【F:apps/worker/src/finance/backfill-donations.ts†L1-L321】【F:apps/worker/package.json†L1-L24】
2. **Audit:** verify historical records before applying.
   ```bash
   pnpm --filter worker run backfill:donations --mode=audit --limit=200
   ```
   Any discrepancies (missing journals, mismatched splits) are logged with donation IDs for manual review.
3. **Apply:** once the audit comes back clean, post the journals and wallet credits.
   ```bash
   pnpm --filter worker run backfill:donations --apply --limit=200
   ```
   The script posts donation-success journals, credits creator wallets, and stamps `availableAt` in the same shapes used by the live webhook handler.

## 3. Post-backfill verification
1. Spot-check the admin dashboards for the affected range to confirm totals line up with the expected gross/net/VAT amounts. Use the CSV export for an offline ledger review. 【F:apps/web/src/app/admin/admin-smoke.test.tsx†L1-L86】
2. Review the reconciliation worker logs (`finance:reconcile`) for the next cycle to ensure no new variances were introduced. 【F:apps/worker/src/index.ts†L52-L212】
3. Archive the audit/backfill logs in the shared finance folder for future reference.

## 4. Incident response tips
- If the webhook callback fails mid-transaction, requeueing is safe—the callback handler is idempotent and rolls back donation updates on ledger errors. 【F:apps/api/src/donations/services/donation-callback.service.test.ts†L1-L360】
- When a payout disbursement job fails, monitor the `finance.alerts.emitted` metric and review the payout failure alerts emitted by the worker. 【F:apps/worker/src/index.ts†L52-L212】

Keep this runbook updated whenever the finance flows evolve.

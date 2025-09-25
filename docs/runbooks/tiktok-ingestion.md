# TikTok Ingestion Runbook

_Last updated: 2025-10-16_

This runbook covers day-two operations for the TikTok Display API ingestion pipeline across the API and worker services. Follow these steps when provisioning environments, responding to incidents, or performing manual interventions.

## 1. Prerequisites & Environment Variables
- **KMS key:** `trendpot/tiktok-display-oauth` (AES-256-GCM). Confirm grants include the API and worker IAM roles.
- **Secrets:** Ensure `TIKTOK_CLIENT_SECRET`, `TIKTOK_WEBHOOK_SECRET`, and `TIKTOK_TOKEN_ENC_KEY_ID` are sourced from AWS Secrets Manager. Rotate quarterly.
- **Environment variables:**
  - API: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, `TIKTOK_DISPLAY_SCOPES`, `TIKTOK_TOKEN_ENC_KEY_ID`.
  - Worker: `TIKTOK_CLIENT_KEY`, `TIKTOK_INGESTION_PAGE_SIZE`, `TIKTOK_INGESTION_METRICS_BATCH_SIZE`, `TIKTOK_METRICS_REFRESH_INTERVAL_MS`, `TIKTOK_INGESTION_RATE_LIMIT_PER_MIN`, `TIKTOK_INGESTION_RETRY_BACKOFF_MS`, `TIKTOK_TOKEN_ENC_KEY_ID`.
  - Shared: `MONGODB_URI`, `REDIS_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT`.

## 2. Linking Accounts (OAuth → Queue)
1. Creator completes TikTok OAuth in the web app.
2. API service encrypts tokens with the `TikTokTokenService` and upserts the `tiktok_accounts` document.
3. API enqueues `tiktok:ingestion` job (`trigger=account_linked`).
4. Verify enqueue in logs: `auth.tiktok.account_upserted` and `tiktok.ingestion.completed` with matching `requestId`.
5. If the queue fails, retry by calling `POST /admin/tiktok/accounts/{id}/resync` (future endpoint) or enqueue manually via `apps/api/src/tiktok/tiktok-ingestion.queue.ts` script.

## 3. Initial Sync Diagnostics
- Worker fetches creator videos, sanitizes embeds, and upserts `videos` documents.
- Successful runs publish `tiktok.videos.initial_sync` on Redis channel `tiktok:videos:update:<accountId>`.
- Check Mongo:
  ```bash
  db.videos.find({ ownerTikTokAccountId: ObjectId("<accountId>") }).pretty()
  ```
- Common failure codes:
  - `tiktok.display_api_error`: TikTok responded with non-200 status. Inspect `status` and `body` in logs.
  - `tiktok.ingestion.failed`: Sanitization or persistence error. Review stack trace and retry after fixes.

## 4. Metrics Refresh Monitoring
- Metrics jobs repeat every `TIKTOK_METRICS_REFRESH_INTERVAL_MS` via BullMQ repeatable jobs.
- Each run publishes `tiktok.videos.metrics_refreshed` payloads with `updated` and `total` counts.
- Mongo `tiktok_accounts.syncMetadata.lastMetricsRefreshAt` and `lastMetricsErrorAt` track health. Alert if `lastMetricsErrorAt` is newer than refresh timestamp.
- Metrics fetch uses rate limits defined by `TIKTOK_INGESTION_RATE_LIMIT_PER_MIN`; adjust cautiously to remain below TikTok quotas.

## 5. Manual Refresh or Backfill
1. Trigger a manual refresh by enqueuing a `tiktok:refresh` job:
   ```ts
   import { Queue } from "bullmq";
   import { TIKTOK_REFRESH_QUEUE } from "@trendpot/types";

   const queue = new Queue(TIKTOK_REFRESH_QUEUE, { connection: { host: "redis-host", port: 6379 } });
   await queue.add("metrics-refresh", {
     accountId: "<accountId>",
     reason: "manual",
     queuedAt: new Date().toISOString(),
     requestId: `manual-${Date.now()}`
   });
   ```
2. Confirm the job result in logs and Redis notifications.
3. Update runbook notes with manual interventions for audit tracking.

## 6. Incident Response
- **Token refresh failures:** Look for `tiktok.token.refresh_failed` logs. Validate KMS access and TikTok client credentials. If refresh token expired, prompt creator to relink their account.
- **Sanitizer rejections:** Workers throw `tiktok.ingestion.failed` with context. Ensure the backend sanitizer matches worker version; redeploy both if schema changed.
- **Redis outage:** Queue processing pauses. Jobs retry automatically once Redis resumes. Manually resume by restarting worker pods if they exhausted retries.

## 7. Compliance & Auditing
- Retain audit logs for token issuance, refreshes, and manual revocations for at least 18 months.
- Sanitization tests (`@trendpot/types` and worker/job integration tests) must stay green before deploying ingestion changes.
- Document any manual data fixes or token rotations in the compliance tracker linked from `DEVELOPMENT_TRACKER.md`.

---
For questions or updates, ping #tiktok-ingestion in Slack and keep this runbook in sync with production changes.

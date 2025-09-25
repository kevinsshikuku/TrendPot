# TikTok Display API Alignment Notes

## Purpose
Product, compliance, and engineering agreed to fold the TikTok Display API ingestion requirements into the existing TikTok OAuth bridge so that creators authorize content sync in a single consent step. This document captures the decisions, secrets provisioning asks, and rate-limit expectations that unblock backend and worker implementation work.

## OAuth Scope & Consent Decisions
- **Unified consent:** We will request Display API scopes during the existing login flow so creators approve content ingestion alongside account access. No secondary consent screen is required.
- **Scope bundle:**
  - `user.info.basic` – required to correlate TikTok accounts with TrendPot creators.
  - `video.list` – lists videos that can be ingested into submissions.
  - `video.data` – fetches engagement metrics for refresh jobs.
  - `webhook.subscription` – reserved for future webhook triggers; approved to include now to avoid another consent cycle.
- **Consent copy:** Update the OAuth hand-off page to state that TrendPot will "ingest approved TikTok videos and refresh their metrics periodically" to satisfy compliance transparency guidance.
- **Data minimization:** Only persist sanitized oEmbed payloads and metrics specified in the submissions schema; raw HTML/snippets must pass through the shared sanitizer before storage.

## Token Storage & Key Management
- **KMS alias:** `trendpot/tiktok-display-oauth` (AES-256-GCM). Ops to create in AWS KMS `us-east-1` with grants for `apps/api` and `apps/worker` service roles.
- **Secrets manager entries:** Store encrypted client secret, webhook secret, and app signing secret in AWS Secrets Manager and expose them via environment variables listed below.
- **Rotation policy:** Quarterly rotation for the client secret and webhook secret; tokens re-encrypted automatically during the next refresh cycle.

## Environment Variables
| Variable | Service(s) | Description |
| --- | --- | --- |
| `TIKTOK_CLIENT_KEY` | api, worker | Existing key reused for Display API; ensure value matches Display app ID. |
| `TIKTOK_CLIENT_SECRET` | api | Pulled from Secrets Manager; decrypted at boot. |
| `TIKTOK_DISPLAY_SCOPES` | api, web | Space-separated scopes requested during OAuth (`user.info.basic video.list video.data webhook.subscription`). |
| `TIKTOK_DISPLAY_API_BASE_URL` | api, worker | Default `https://open-api.tiktok.com`. Allows staging overrides. |
| `TIKTOK_DISPLAY_OAUTH_REDIRECT` | api, web | Overrides `TIKTOK_REDIRECT_URI` when Display scopes enabled (staging/prod variants). |
| `TIKTOK_TOKEN_ENC_KEY_ID` | api, worker | Set to ARN of `trendpot/tiktok-display-oauth` key. |
| `TIKTOK_WEBHOOK_SECRET` | api | HMAC secret for future webhook verification; provision now with random 32-byte value. |
| `TIKTOK_INGESTION_PAGE_SIZE` | api, worker | Default `20`; controls page size for ingestion jobs. |
| `TIKTOK_INGESTION_RATE_LIMIT_PER_MIN` | worker | Global throttle (see next section). |
| `TIKTOK_INGESTION_RETRY_BACKOFF_MS` | worker | Base delay for exponential backoff when TikTok responds with 429/5xx. |
| `TIKTOK_INGESTION_CONCURRENCY` | worker | Number of concurrent initial sync jobs (default `1`). |
| `TIKTOK_REFRESH_CONCURRENCY` | worker | Number of concurrent metrics refresh jobs (default `1`). |
| `TIKTOK_METRICS_REFRESH_INTERVAL_MS` | worker | Interval for recurring metrics refresh jobs (default `900000`). |
| `TIKTOK_INGESTION_METRICS_BATCH_SIZE` | worker | Batch size for Display API metrics refresh (default `20`). |

Ops should provision staging and production variants for all new variables and share the Secrets Manager ARNs in the internal credentials tracker.

## Rate Limit & Telemetry Plan
- **Display API baseline:** TikTok confirms a ceiling of **100 requests per minute** and **5,000 requests per day** per app. Worker ingestion must respect both.
- **Throttle configuration:**
  - Worker scheduler will cap concurrent API calls at 5 using BullMQ rate limiting.
  - `TIKTOK_INGESTION_RATE_LIMIT_PER_MIN` defaults to `90` to leave headroom for manual retries and support diagnostics.
  - Burst detection metrics exposed via OTel (`tiktok.display.rate_limit_exceeded`) with SLO alerts if more than 3 spikes/hour occur.
- **Backoff policy:** Exponential backoff starting at `TIKTOK_INGESTION_RETRY_BACKOFF_MS` (default `5000`), doubling up to 5 attempts before marking a job as failed and notifying ops.

## Token Lifecycle & Privacy Controls
- **Encryption at rest:** Access and refresh tokens are encrypted with the KMS-backed `TikTokTokenCipher`. The cipher key ID is persisted with every credential so rotations can be enforced without downtime. Workers verify `keyId` before decrypting and surface `E_TIKTOK_KEY_MISMATCH` metrics if a stale key is detected.
- **Lifecycle:**
  - Access tokens are refreshed automatically when within 60 seconds of expiry; refresh tokens are rotated whenever TikTok issues a new secret.
  - Mongo `tiktok_accounts` documents track the latest profile, video, and metrics sync timestamps plus the last error for operational visibility.
  - User documents mirror encrypted token blobs to keep manual API requests (GraphQL, REST) in sync with worker refreshes.
- **Deletion & revocation:** Manual revocation clears encrypted blobs from both the account and user document and publishes `tiktok.videos.update` events so caches prune submissions. Audit logs record the actor and reason for every revoke event.
- **Access logging:** All token decryptions emit structured logs with `requestId`, `accountId`, and `operation` labels so compliance can reconcile usage during audits.

## Privacy & Data Minimization Notes
- **Sanitized embeds only:** Only sanitized oEmbed HTML that passes the shared Zod schema is persisted. Tests assert that script/style tags, inline handlers, `javascript:` URLs, and untrusted hosts are rejected before storage.
- **Metrics scope:** Workers persist only aggregate counts (views, likes, comments, shares). Raw viewer data, author metadata beyond the embed, and private account fields are never stored.
- **Red-team scenarios:** Automated tests cover malicious HTML payloads (script injection, onload, javascript URLs, hostile CDNs) and ensure the sanitizer rejects them. Additional tests validate the OAuth-to-ingestion queue hand-off and metrics refresh flow so regressions are caught before deployment.
- **PII handling:** Creator display names and avatars are optional and sanitized to strip embedded markup; raw OAuth payloads are discarded after normalization.

## Next Actions
1. Ops to provision KMS alias, Secrets Manager entries, and environment variable scaffolding in staging & production.
2. Product/compliance to review updated consent copy by end of week; frontend to implement wording change once approved.
3. Backend to reference `TIKTOK_DISPLAY_SCOPES` when constructing OAuth URLs and begin implementing ingestion clients after ops confirms provisioning.

# TikTok Content Ingestion & Presentation Review

_Date: 2025-10-18_

## Summary
A review of the TikTok Display API OAuth, ingestion, and presentation stack uncovered several gaps that prevent the system from meeting the documented requirements. The most critical issues relate to missing OAuth scopes, incomplete ingestion coverage, and token encryption that diverges from the agreed KMS-backed approach.

## Key Findings

1. **OAuth flow never requests the Display API scopes.**
   * `PlatformAuthService` falls back to a hard-coded `DEFAULT_TIKTOK_SCOPES = ["user.info.basic"]` and only uses caller-supplied scopes when provided, so the `video.list`/`video.data` grants required for ingestion are never requested during normal login flows.【F:apps/api/src/platform-auth/platform-auth.service.ts†L118-L143】
   * This contradicts the alignment notes that mandated bundling `user.info.basic video.list video.data webhook.subscription` into the unified consent flow and exposing them via the `TIKTOK_DISPLAY_SCOPES` environment variable.【F:docs/design/tiktok-display-alignment.md†L6-L37】 As a result, subsequent Display API calls will fail with 403 errors once TikTok enforces scope checks.

2. **Token encryption is not backed by the required KMS key.**
   * The shared `TikTokTokenCipher` silently derives an AES key from the session secret when `TIKTOK_TOKEN_ENC_KEY` is unset, meaning environments without the explicit 32-byte key bypass the `trendpot/tiktok-display-oauth` KMS alias that compliance required.【F:packages/utils/src/tiktok-token-crypto.ts†L9-L58】
   * Both the design doc and the ingestion runbook call out the KMS alias and Secrets Manager provisioning as mandatory, but no code path currently enforces usage of the managed key ID or integrates with KMS to obtain it.【F:docs/design/tiktok-display-alignment.md†L16-L37】【F:docs/runbooks/tiktok-ingestion.md†L7-L13】 This undermines the “encrypted via KMS” deliverable and complicates key rotation.

3. **Ingestion only ever fetches the first page of creator videos.**
   * The API’s `listCreatorVideos` request hard-codes `cursor: null`, ignoring the decoded `after` cursor and TikTok’s `has_more` pagination flag, so every request re-fetches the same first page.【F:apps/api/src/tiktok/tiktok.service.ts†L118-L155】
   * The worker initial sync mirrors the same bug—`fetchCreatorVideos` also posts `cursor: null` and never loops while `has_more` is true—so the database never receives videos beyond the first `max_count`.【F:apps/worker/src/tiktok/tiktok-jobs.ts†L270-L302】 Challenges with more than ~20 videos will therefore miss older submissions, and background refresh jobs will never see them.

4. **Single-video lookups hit the wrong Display API endpoint.**
   * When a creator tries to submit a video that is not already cached, `ensureVideoAvailable` calls the `/v2/video/list/` endpoint with a `video_ids` array, but that endpoint only accepts pagination parameters. The correct API for targeted lookups is `/v2/video/data/`. The current call will either be rejected or ignore the filter, leading to “video could not be located” errors for valid IDs.【F:apps/api/src/tiktok/tiktok.service.ts†L426-L457】

## Additional Observations

* Redis queue wiring, HTML sanitisation, and the frontend embed shell line up with the documented expectations, but the ingestion bugs above mean creators will still see stale or missing submissions even though the UI is prepared to render them.
* Background metrics refresh jobs are scheduled, yet because initial ingestion never stores the full corpus, refresh coverage will remain incomplete until pagination is fixed.

## Recommendations

1. Load the required scopes from `TIKTOK_DISPLAY_SCOPES`, defaulting to the documented bundle when unset, and ensure both the Next.js bridge and backend use that list.
2. Replace the cipher fallback with an explicit failure when the managed encryption key (or a KMS-derived data key) is unavailable, and plumb the configured `TIKTOK_TOKEN_ENC_KEY_ID` through the services.
3. Update both the API and worker ingestion clients to honour `cursor` / `has_more` pagination and to continue fetching until TikTok exhausts the result set.
4. Switch ad-hoc video fetches to `/v2/video/data/` (reusing the metrics helper) so challenge submissions succeed even when a video hasn’t been pre-synced.

Addressing these issues is a prerequisite for reliably ingesting and presenting TikTok content under the Display API contract.

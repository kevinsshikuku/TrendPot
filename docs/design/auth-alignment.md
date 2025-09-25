# TikTok OpenAuth Overhaul (Milestone Reset)

## Purpose
With the product still pre-production, we are discarding the email OTP prototype and cutting directly to a TikTok-first authentication stack. This document is the fresh source of truth for the unified rollout. It captures the user/permission matrix we are keeping, the new identity & session architecture, the end-state GraphQL/Next.js contracts, and the one-shot cutover checklist. Any prior documentation that referenced client-managed cookies, base64 headers, or OTP enrollment flows is obsolete and has been removed in this revision.

## User Roles & Permissions (Unchanged)
Role definitions and permissions remain identical to the previous alignment so we can preserve authorization logic across the API and UI layers.

| Role | Description | Key Permissions |
| --- | --- | --- |
| `fan` | Supporters who register to follow creators and donate to challenges. | `view_public_profile`, `initiate_donation`, `manage_own_sessions`, `update_own_profile` |
| `creator` | Challenge owners publishing content, managing submissions, and engaging with donors. | All `fan` permissions plus `manage_own_challenges`, `view_own_donations`, `manage_own_submissions`, `manage_creator_profile` |
| `operator` | Trust & safety / support staff resolving tickets and managing compliance records. | All `creator` permissions plus `view_all_donations`, `view_audit_logs`, `manage_sessions`, `flag_content`, `resolve_support_cases` |
| `admin` | Platform administrators owning configuration, payouts, and high-risk actions. | All `operator` permissions plus `manage_all_challenges`, `manage_roles`, `manage_payouts`, `manage_security_settings`, `manage_rate_limits` |

`@trendpot/types/auth` continues to export the canonical Zod enums and schemas for roles, permissions, sessions, and viewer payloads. Every service must import from there—no local enums.

## Identity & Session Architecture

### TikTok Identity Source of Truth
* TikTok OpenAuth is the only entry point for creating authenticated users. We exchange the OpenSDK auth code on the API, encrypt the returned access & refresh tokens with KMS (`AES-256-GCM`), and persist the TikTok user profile (`open_id`, `display_name`, avatar URLs) on the TrendPot user record.
* Guests: anonymous visitors get a short-lived, unsigned guest cookie (client-managed) for UX continuity, but **no backend session** is created until TikTok login completes. The API no longer exposes helpers for issuing guest sessions, keeping the implementation aligned with this rule.
* Progressive profile data (name, phone, preferences) is optional at login. Backend mutations enforce additional fields only when donors/creators attempt privileged actions.
* A dedicated `ProfileCompletionGuard` wraps high-risk GraphQL mutations (donations, challenge management, payouts) and emits a structured `PROFILE_INCOMPLETE` error with `missingFields` so the UI can prompt for the required details inline.

### Session & Cookie Model
* API issues a single HTTP-only, secure, same-site session cookie (`trendpot.sid`) containing a signed opaque token. Refresh tokens stay server-only (hashed with `AUTH_REFRESH_HASH_SECRET`) and are never exposed to the browser.
* GraphQL context resolver **must** look up the session document by the opaque token, validate expiry & status, and hydrate `viewer` from the database snapshot. Any headers named `X-TrendPot-User`/`Session` are no longer accepted.
* Session documents capture TikTok linkage metadata, request fingerprint (IP, UA), and role snapshot to keep revocation/audit intact.

### Legacy Components Removed
* Deleted OTP factor collections, HMAC OTP secrets, and `requestEmailOtp`/`verifyEmailOtp` mutations.
* Removed Fastify routes that wrote readable user/session cookies to the client.
* Stripped frontend helpers that serialized auth payloads into `localStorage` or non-HTTP-only cookies.

## Data Model Updates
Mongo schemas now reflect the TikTok linkage and the absence of OTP factors.

### `users`
* New fields: `tiktokUserId` (unique index), `tiktokUsername`, `tiktokAvatar`, and `tiktokScopes` capturing the granted permissions snapshot.
* Email becomes nullable so we can persist pre-auth guest rows while still enforcing uniqueness when supplied.
* `metadata.authOrigin` now records `guest` or `tiktok` alongside a `metadata.guest` flag; OTP provenance has been fully removed.

### `sessions`
* Fields: `_id`, `userId`, `rolesSnapshot`, `issuedAt`, `expiresAt`, `refreshTokenHash`, `ipAddress`, `userAgent`, `status`, `metadata` (includes TikTok `open_id` for quick joins).
* TTL index on `expiresAt`; unique index on `refreshTokenHash`. Session issuer stores hashed refresh plus opaque session token mapping.

### `audit_logs`
* Extended action catalog with `auth.tiktok.login`, `auth.tiktok.refresh`, `auth.session.invalidate`, and `auth.profile.update`. Email OTP events dropped.

## Frontend Contracts
* The Next.js app initializes TikTok OpenSDK on `/login`. On success, it calls the new `/api/auth/tiktok/callback` proxy, which finalizes the exchange server-side, sets `trendpot.sid`, and redirects to the originating path.
* React Query hooks in `packages/types` now call `viewer` to hydrate session state after the cookie is set—no manual header forwarding.
* Guest mode: UI renders limited challenge browsing without hitting gated mutations. When the user attempts a protected action, show a TikTok login CTA followed by progressive profile prompts.
* The account dashboard surfaces TikTok-linked identity details plus an inline profile form so users can add their name/phone on demand; success updates React Query caches without forcing a full reload.

## Backend Contracts
* New REST endpoint `/auth/tiktok/callback` handles OpenSDK exchanges, persists/links users, issues sessions, and returns a 302 to the web app.
* GraphQL mutations `startTikTokLogin`, `completeTikTokLogin`, and `updateViewerProfile` cover login plus progressive profile updates while the `/auth/tiktok/callback` REST handler finalises cookies. Gated mutations (donations/challenges/payouts) opt into `ProfileCompletionGuard` so missing details return structured errors.
* `RolesGuard` and `RateLimitGuard` remain but now derive context from validated session lookups. Rate limiter must migrate to Redis/Upstash immediately (required before deployment).

## Observability & Security
* Instrument TikTok token exchanges, session issuance, and refresh flows with structured logs containing `requestId`, TikTok `open_id`, and user `id`.
* TikTok login intents sanitise `returnPath` inputs server-side so callbacks can only redirect to TrendPot-controlled routes, preventing open redirect abuse.
* Sentry scopes include TikTok login context to debug SDK errors.
* Secrets: TikTok client credentials managed via platform vault; encrypted tokens stored with KMS key versioning.

## One-Shot Cutover Checklist
Because we are in a non-production environment, the migration happens in a single coordinated release:

1. **Remove OTP Code Paths**
   - Delete OTP modules, DTOs, and resolvers from `apps/api` and drop related collections or migrations.
   - Purge OTP UI flows, pages, and hooks from `apps/web`.

2. **Implement TikTok OAuth Backend**
   - Add Fastify handler for `/auth/tiktok/callback` with code exchange, encryption, user linking, and session issuance.
   - Update Mongo schemas (`users`, `sessions`, `audit_logs`) with TikTok fields and indexes; write migration script to backfill dev data or drop collections.

3. **Harden Session Context**
   - Replace header-based auth context with server-side session lookup + verification; reject any stale client headers.
   - Ensure cookies are HTTP-only, secure (respecting localhost exceptions), and `SameSite=lax`.

4. **Frontend Integration**
   - Wire TikTok OpenSDK init, callback redirect handling, and `viewer` hydration.
   - Provide guest browsing plus progressive profile prompts post-login.

5. **Rate Limiting & Guards**
   - Swap in Redis-backed rate limiter to preserve throttling under multi-instance testing.
   - Confirm `RolesGuard` pulls `roles` from validated session context and `ProfileCompletionGuard` is attached to all privileged mutations.

6. **QA & Cleanup**
   - Run end-to-end tests covering guest browse, TikTok login, donation gating, session revocation.
   - Update documentation, runbooks, and developer onboarding to reflect TikTok-first auth.
   - Remove environment variables tied to OTP (`AUTH_OTP_*`) from sample env files.

## Revision History
* **2025-10-09** – Overhauled document to deprecate email OTP stack and define the TikTok OpenAuth architecture, including single-release cutover plan and data model updates. Legacy notes about base64 headers and OTP flows deleted.
* **2025-10-10** – Added profile-completion guardrails, TikTok-linked account dashboard UX, Redis-backed rate-limit reminder, and removed the last OTP references from schemas and docs.

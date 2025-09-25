# In-House Authentication Alignment (Phase 0)

## Purpose
This document captures the shared understanding for Milestone 3 (In-House Authentication & Access Control) so every team can execute against the same contracts. It summarizes user roles, mapped permissions, and Mongo data modeling decisions for auth-related collections. These decisions are the source of truth for Platform, Backend, and Frontend workstreams.

## User Roles & Permissions
The platform supports four primary user roles. Permissions are intentionally granular so guards can be enforced consistently across API resolvers, admin routes, and frontend clients.

| Role | Description | Key Permissions |
| --- | --- | --- |
| `fan` | Supporters who register to follow creators and donate to challenges. | `view_public_profile`, `initiate_donation`, `manage_own_sessions`, `update_own_profile` |
| `creator` | Challenge owners publishing content, managing submissions, and engaging with donors. | All `fan` permissions plus `manage_own_challenges`, `view_own_donations`, `manage_own_submissions`, `manage_creator_profile` |
| `operator` | Trust & safety / support staff resolving tickets and managing compliance records. | All `creator` permissions plus `view_all_donations`, `view_audit_logs`, `manage_sessions`, `flag_content`, `resolve_support_cases` |
| `admin` | Platform administrators owning configuration, payouts, and high-risk actions. | All `operator` permissions plus `manage_all_challenges`, `manage_roles`, `manage_payouts`, `manage_security_settings`, `manage_rate_limits` |

### Permission Catalogue
- `view_public_profile`: Read-only access to public creator/fan information and challenge listings.
- `initiate_donation`: Start payment flows (e.g., M-Pesa STK push) against eligible challenges.
- `manage_own_sessions`: Create/revoke personal sessions, refresh tokens, and view login history.
- `update_own_profile`: Edit personal contact preferences, bio, and notification settings.
- `manage_own_challenges`: Create, edit, archive, and publish owned challenges.
- `view_own_donations`: Access donation telemetry and payout summaries tied to owned challenges.
- `manage_own_submissions`: Moderate creator submissions, respond to donor feedback, and publish updates.
- `manage_creator_profile`: Manage creator-specific settings, links, and feature flags.
- `view_all_donations`: View donation ledgers across the platform for compliance/reconciliation.
- `view_audit_logs`: Read immutable audit trails for sensitive actions.
- `manage_sessions`: Revoke active sessions for any user (support-level capability).
- `flag_content`: Escalate or quarantine content that violates policies.
- `resolve_support_cases`: Close, annotate, or transfer support tickets.
- `manage_all_challenges`: Override challenge states, edit metadata, or migrate ownership.
- `manage_roles`: Assign or revoke roles for any user.
- `manage_payouts`: Configure creator payout schedules and mark disbursements complete.
- `manage_security_settings`: Adjust security headers, session policies, and auth factor requirements.
- `manage_rate_limits`: Tune rate limiting thresholds for APIs and auth factors.

## Shared Zod Contracts
To guarantee alignment, the shared `@trendpot/types` package now exports `auth` schemas that encode the above roles and permissions, along with canonical shapes for users, auth factors, sessions, and audit log entries. All teams must import from `@trendpot/types/auth` (or the aggregate index) instead of redefining ad-hoc types. This ensures:

1. GraphQL context and resolvers enforce identical role/permission enums.
2. Frontend clients rely on the same discriminated unions when rendering gated experiences.
3. Worker jobs use consistent identifiers when processing sessions or audit events.

### GraphQL Context Header Contract
- **Headers**: `X-TrendPot-User` and `X-TrendPot-Session` carry base64url-encoded JSON payloads that conform to the shared `userSchema` and `sessionSchema`. Backend resolvers decode these values to populate the GraphQL context and feed authorization guards.
- **Viewer Query**: A new `viewer` query returns the decoded payload using the shared `viewerSchema`, enabling the frontend to hydrate session-aware UX without duplicating parsing logic.
- **Failure Handling**: Malformed payloads are rejected and logged via the auth audit service; guards treat missing/invalid headers as unauthenticated requests.

## Mongo Data Modeling Decisions
Collections follow existing repository guidance: ObjectId foreign keys, referencing relationships, and TTL indexes for ephemeral documents.

### `users`
- **Indexes**: Unique compound on `{ email: 1 }`, optional unique on `{ phone: 1 }`, and sparse index on `handle` for creators.
- **Fields**:
  - `_id`: ObjectId
  - `email`: string (lowercased)
  - `phone`: optional string in E.164
  - `roles`: array of `UserRole`
  - `displayName`: string
  - `status`: enum (`active`, `disabled`, `pending_verification`)
  - `createdAt` / `updatedAt`: ISO strings
  - `metadata`: object for feature flags, locales, and notification preferences
- **Rationale**: Keep authentication factors separate; user document focuses on identity and platform-facing attributes.

### `auth_factors`
- **Indexes**: Compound unique on `{ userId: 1, type: 1, channel: 1 }`; TTL index on `expiresAt` for OTPs.
- **Fields**:
  - `_id`: ObjectId
  - `userId`: ObjectId reference to `users`
  - `type`: enum (`email_otp`, `magic_link`)
  - `channel`: string (`email`, `phone`)
  - `secretHash`: string (hashed OTP or token)
  - `attempts`: number (int, defaults to 0)
  - `expiresAt`: Date
  - `createdAt`: Date
  - `status`: enum (`active`, `consumed`, `expired`, `revoked`)
- **Rationale**: Supports passwordless flows with per-factor lifecycle management and auditing.

### `sessions`
- **Indexes**: Unique on `refreshTokenHash`; TTL on `expiresAt`; compound on `{ userId: 1, createdAt: -1 }` for history queries.
- **Fields**:
  - `_id`: ObjectId
  - `userId`: ObjectId reference to `users`
  - `rolesSnapshot`: array of `UserRole` captured at issuance
  - `issuedAt`: Date
  - `expiresAt`: Date
  - `refreshTokenHash`: string
  - `ipAddress`: string
  - `userAgent`: string
  - `status`: enum (`active`, `revoked`, `expired`)
  - `metadata`: object (device labels, risk flags)
- **Rationale**: Maintains revocation controls and auditability for session management.

### `audit_logs`
- **Indexes**: Compound on `{ actorId: 1, createdAt: -1 }`, and TTL optional for low-sensitivity entries if retention policies allow; full-text index on `context.summary` for support.
- **Fields**:
  - `_id`: ObjectId
  - `actorId`: ObjectId reference to `users`
  - `actorRoles`: array of `UserRole`
  - `action`: enum (`auth.login`, `auth.logout`, `auth.factor.enroll`, `auth.factor.challenge`, `auth.session.revoke`, `security.settings.update`, etc.)
  - `target`: optional ObjectId or string reference to impacted resource
  - `context`: object containing request metadata (IP, user agent, requestId)
  - `createdAt`: Date
  - `severity`: enum (`info`, `warning`, `critical`)
- **Rationale**: Centralizes traceability for sensitive operations and feeds observability pipelines.

## Next Steps
- Platform team to scaffold NestJS modules using the above schemas for user creation and auth factor issuance.
- Backend team to integrate role-based guards using `userRoleSchema` and `permissionSchema` exports.
- Frontend team to consume the new contracts for gating routes/components while UX flows are designed.
- Add integration tests verifying serialization/deserialization of the shared contracts once API endpoints are implemented.

## Phase 1 Implementation Notes (2025-10-05)
- Introduced a dedicated `PlatformAuthModule` in the API that manages Mongo collections for users, auth factors, sessions, and audit logs with the indexes described above.
- Implemented an email OTP flow that hashes codes with an HMAC secret, signs single-use verification tokens, enforces per-identifier rate limits, and emits structured audit log records for enrollment, challenge, and verification events.
- Session issuance now persists request metadata (IP, user agent, device label) alongside refresh token hashes, and sets HTTP-only, SameSite cookies signed with service secrets for future GraphQL context hydration.
- Email delivery remains stubbed via structured logging until the transactional provider is wired; secrets and TTLs default via environment variables (`AUTH_OTP_*`, `AUTH_SESSION_*`) to support local development.

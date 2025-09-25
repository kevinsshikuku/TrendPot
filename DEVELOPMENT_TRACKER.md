# TrendPot Delivery Tracker

> **Purpose**: Use this document as the single source of truth for planning, execution, and verification across the TrendPot monorepo. Each milestone acts as a checkpoint toward launch readiness. When a deliverable is completed, append a dated comment in the **Notes** line describing what was shipped and by whom.

- **Status Legend**
  - ☐ = Not started
  - ▣ = In progress / partially delivered
  - ☑ = Complete (document completion details in Notes)
- **Notes Guideline**: `YYYY-MM-DD – Initials – Summary of change or link to PR`
- **Authentication Principle**: All identity, session, and authorization capabilities must be implemented in-house. Do not integrate paid third-party auth providers (e.g., Clerk).
- **Design Principle**: Every feature must account for desktop and mobile breakpoints; capture responsive mockups/wireframes before implementation and store references in design documentation.

## Current State Overview (Last Updated: 2025-09-25)

### Frontend (Next.js PWA)
- **Status**: ▣
- **Snapshot**: Admin challenge management flows support create/edit/archive with responsive forms, validation feedback, and analytics-driven listings; public surfaces still lack navigation, auth gating, and install prompts.
- **Implementation Notes**: Responsive component library now covers admin dashboards but must extend to public donation and creator experiences for full desktop/mobile parity.

### Backend & GraphQL API (NestJS + Mercurius)
- **Status**: ▣
- **Snapshot**: GraphQL schema exposes full challenge lifecycle mutations (create/update/archive) with optimistic locking and status transition enforcement alongside listing analytics.
- **Implementation Notes**: Authentication, rate limiting, and additional domain models (donations, submissions, payouts) remain unimplemented.

### Worker (BullMQ)
- **Status**: ☐
- **Snapshot**: Leaderboard queue returns mocked payloads.
- **Implementation Notes**: Producers and TikTok/donation integrations need to be wired before milestones can progress.

### Shared Types & Contracts
- **Status**: ▣
- **Snapshot**: Zod schemas cover challenges, lifecycle statuses, optimistic locking payloads, and a minimal leaderboard payload.
- **Implementation Notes**: User, donation, submission, auth, and webhook envelopes are missing from shared contracts.

### UI/UX & Design System
- **Status**: ☐
- **Snapshot**: `packages/ui` exports only a button primitive.
- **Implementation Notes**: Establish responsive design tokens and component patterns that address both desktop and mobile breakpoints.

### Security Measures
- **Status**: ☐
- **Snapshot**: CORS accepts any origin, Helmet is absent, and request throttling is not configured.
- **Implementation Notes**: Credentials live in environment variables without documented rotation guidance; introduce in-house controls.

### Observability & Testing
- **Status**: ☐
- **Snapshot**: No automated test scripts, tracing, or metrics wiring exist today.
- **Implementation Notes**: Logging is minimal and inconsistent, leaving future debugging at risk.

### Infrastructure & Ops
- **Status**: ☐
- **Snapshot**: Terraform and infra directories are placeholders.
- **Implementation Notes**: Deployment automation, secrets management, and CI gates must be implemented.

### Documentation
- **Status**: ▣
- **Snapshot**: README and APPLICATION_FLOW outline intent.
- **Implementation Notes**: This tracker now consolidates state and milestones for a single glance across teams.

### Frontend Snapshot
- **Routing & Data**: Admin routes deliver create/edit forms that hydrate React Query caches, process GraphQL validation errors, and surface challenge analytics with server-driven pagination and filters. Public routes (`/`, `/challenges`, `/c/[id]`) still present placeholder KPIs and lack authenticated flows for donations or submissions.
- **State Management**: React Query client is initialized globally; admin workflows incorporate optimistic updates and cache invalidation, while public error/loading states remain basic and not mobile-optimized.
- **Responsiveness**: Admin dashboards render responsive tables/cards with mobile-first layouts; broader site still needs dedicated mobile navigation, sticky CTAs, and adaptive typography tokens for parity.
- **Installability**: No web app manifest, service worker, or offline caching strategy is implemented despite PWA goals.

### Backend & API Snapshot
- **Schema Coverage**: GraphQL exposes challenge queries plus create/update/archive mutations with lifecycle status enums, optimistic locking inputs, and analytics fields; donations, submissions, TikTok content, and auth endpoints are still missing.
- **Business Logic**: Challenge service enforces version checks and allowable status transitions before persistence but continues to lack authorization, rate limiting, and audit logging. Validation beyond Nest defaults is minimal.
- **Persistence**: `ChallengeEntity` includes lifecycle metadata; collections for users, donations, payouts, submissions, OAuth tokens, and audit trails must be modeled to meet roadmap requirements.
- **Security**: API accepts cross-origin requests (`origin: true`) with credentials; Helmet and throttlers are not configured. Secrets are expected via environment variables without rotation playbooks.

### Worker & Background Jobs Snapshot
- BullMQ worker registers a `leaderboard` queue that returns static demo data validated by Zod.
- No producers, schedulers, or integrations with Mongo/GraphQL are wired; retries rely on shared helper defaults.
- Queue-based notifications, TikTok refresh jobs, and donation reconciliation are not implemented.

### Shared Types & Contracts Snapshot
- `@trendpot/types` contains Zod schemas for challenges with lifecycle status enums, optimistic locking inputs, and a minimal leaderboard payload.
- Missing domain types: users/auth sessions, submissions, donations, payouts, TikTok assets, webhook envelopes, and audit logs.
- Persisted query governance and schema diff tooling are planned but not yet configured in CI.

### UI/UX & Design System Snapshot
- `packages/ui` exports only a button primitive; design tokens, typography scales, form controls, navigation, dialogs, and responsive grid primitives are absent.
- No documented desktop/mobile mockups are linked for critical flows (donation, creator dashboard, auth, admin management).
- Accessibility considerations (focus states, contrast ratios, keyboard navigation) are undocumented.

### Security & Compliance Snapshot
- Lack of authentication/authorization on admin routes means `createChallenge` is publicly callable.
- No rate limiting, IP allowlisting, or anomaly detection for API or worker.
- Webhook handlers, encryption-at-rest guidance, and key management for TikTok/M-Pesa tokens are not in place.

### Observability & Testing Snapshot
- No unit, integration, or end-to-end test suites are configured across `web`, `api`, or `worker`.
- Logging omits structured metadata (request IDs, user context) and there is no centralized telemetry pipeline (OTel, Sentry, PostHog) despite project requirements.
- Schema checks, linting gates, and CI workflows need to be defined before feature expansion.

### Infrastructure & Ops Snapshot
- Terraform and infra directories are scaffolds without actual modules; provisioning pipelines for Vercel, AWS, MongoDB Atlas, Redis, and Cloudflare are pending.
- Dockerfiles exist but lack deployment automation, secrets management, and environment parity documentation.
- No runbooks for incident response, staging/prod promotion, or backup validation are recorded.

### Documentation Snapshot
- README sets non-negotiables (PWA installability, TikTok Display API, M-Pesa STK Push, security controls) but many remain unmet.
- APPLICATION_FLOW.md describes existing routes and callouts for missing ones (e.g., `/me`), which should be referenced as features land.
- This tracker now consolidates state, milestones, and future checkpoints for quick glance status across teams.

### Key Gaps & Risks (Quick Reference)
- **Security**: Public admin mutation access, permissive CORS, missing rate limiting, no audit logs.
- **Domain Coverage**: Only challenges modeled; donations, TikTok videos, user accounts, payouts, and compliance artifacts missing.
- **UX Depth**: Read-only experience without donation or creator flows; design system incomplete for responsive delivery.
- **Background Processing**: Worker disconnected from real data sources; no scheduling or notification backbone.
- **Testing/Observability**: Absent automated verification or telemetry increases regression risk as scope expands.

---
## 1. Foundation Hardening & Data Seeding
- ☑ **Author seed scripts for Mongo fixtures (challenges, sample users, submissions) and document runbooks.** _(Owner: Backend)_
  - Notes: 2024-06-06 – AI – Added Mongo seed script and seeding runbook.
- ☑ **Establish unit/integration test harnesses across apps (`web`, `api`, `worker`) with CI pipelines wired.** _(Owner: DX)_
  - Notes: 2025-09-25 – AI – Added Node test harnesses for web/api/worker with representative coverage and scripts; 2025-10-04 – AI – Wired GitHub Actions CI to enforce lint/typecheck/test gates.
- ☑ **Implement structured logging (request IDs, correlation IDs) and baseline error envelopes across API + worker.** _(Owner: Platform)_
  - Notes: 2025-10-04 – AI – Introduced Pino-backed logging, request ID propagation, and GraphQL error envelopes for API and worker services.
- ☑ **Capture responsive desktop/mobile design references for baseline pages (`/`, `/challenges`, `/c/[slug]`).** _(Owner: Design)_
  - Notes: 2025-10-04 – AI – Documented Figma references and responsive behaviors for core pages in `docs/design/responsive-baselines.md`.

## 2. Challenge Management Maturity
- ☑ **Extend GraphQL schema for challenge lifecycle (create/update/archive, status transitions, optimistic locking).** _(Owner: Backend)_
  - Notes: 2025-09-25 – AI – Delivered lifecycle mutations with status enums, optimistic locking, and guarded transitions across service and schema layers.
- ☑ **Enhance admin UI for create/edit with server-driven validation and responsive layouts.** _(Owner: Frontend)_
  - Notes: 2025-09-25 – AI – Added dedicated admin forms that surface GraphQL validation errors, hydrate caches, and adjust layouts for desktop/mobile.
- ☑ **Add pagination/filtering analytics to challenge listings with mobile-first tables/cards.** _(Owner: Frontend)_
  - Notes: 2025-09-25 – AI – Implemented server-driven pagination with status/search filters, analytics panels, and responsive table/card views.

## 3. In-House Authentication & Access Control
- ☑ **Build internal auth service (user store, passwordless/email OTP or similar) with secure session issuance.** _(Owner: Platform)_
  - Notes: 2025-10-05 – AI – Documented Phase 0 auth alignment (roles, permissions, data models) in `docs/design/auth-alignment.md` and shared Zod contracts; 2025-10-05 – AI – Delivered `PlatformAuthModule` with user/auth factor/session/audit schemas, OTP issuance, session cookies, and structured audit logging.
- ☑ **Enforce role-based guards on GraphQL resolvers and admin routes, including rate limiting.** _(Owner: Backend)_
  - Notes: 2025-10-05 – AI – Introduced auth context parsing, viewer contract, role guard, and rate limiter covering admin GraphQL resolvers with audit logging; 2025-10-06 – AI – Added end-to-end coverage for registration/login/session refresh plus guard enforcement and documented OTP entropy, session storage, and replay-protection review results.
- ☑ **Restrict CORS to approved origins and introduce Helmet + security headers across API.** _(Owner: Platform)_
  - Notes: 2025-10-05 – AI – Registered Fastify Helmet, enforced env-driven CORS allowlists with 403 rejections for unknown origins, echoed request IDs, and added tests covering headers + blocked origins.
- ☑ **Produce responsive UX for login/signup/account management (desktop & mobile).** _(Owner: Frontend)_
  - Notes: 2025-10-05 – AI – Built App Router flows for login, signup, OTP verification, and the account dashboard using shared UI primitives, responsive layouts, and React Query; wired Next API routes to proxy GraphQL auth mutations, forward cookies, and manage session revocation. 2025-10-06 – AI – Added middleware gatekeeping for `/account` + `/admin`, sticky CTA footers, mobile session drawers, and documented Figma references for auth/account parity in `docs/design/responsive-baselines.md`.


## 4. TikTok Content Ingestion & Presentation
- ☐ **Implement TikTok Display API OAuth flow, token storage (encrypted), and ingestion workers.** _(Owner: Backend)_
  - Notes:
- ☐ **Model submissions/videos in shared types + Mongo with sanitization rules.** _(Owner: Backend)_
  - Notes:
- ☐ **Surface embedded TikTok content within challenge detail pages with responsive layouts.** _(Owner: Frontend)_
  - Notes:
- ☐ **Schedule background refresh jobs pushing updates to queues and caches.** _(Owner: Worker)_
  - Notes:

## 5. Donation & Payments Flow (M-Pesa)
- ☐ **Integrate Daraja STK Push initiation with idempotent keys and encrypted credentials.** _(Owner: Backend)_
  - Notes:
- ☐ **Handle STK webhooks with signature verification, persistence, and audit trails.** _(Owner: Backend)_
  - Notes:
- ☐ **Build donor UX (desktop/mobile) for initiating donations, viewing receipts, and sharing challenges.** _(Owner: Frontend)_
  - Notes:
- ☐ **Implement creator payout dashboards and notifications, ensuring responsive layouts.** _(Owner: Frontend)_
  - Notes:

## 6. Engagement & Real-time Experience
- ☐ **Replace mocked leaderboard worker with real scoring linked to donations/submissions.** _(Owner: Worker)_
  - Notes:
- ☐ **Broadcast updates via GraphQL subscriptions or Web Push (self-hosted) with retry semantics.** _(Owner: Platform)_
  - Notes:
- ☐ **Define cache strategy (persisted queries, SWR) and document invalidation paths.** _(Owner: Platform)_
  - Notes:

## 7. Security, Observability & Ops Readiness
- ☐ **Introduce rate limiting, threat detection hooks, and audit logging across services.** _(Owner: Platform)_
  - Notes:
- ☐ **Instrument distributed tracing (OTel), metrics dashboards, and alerting runbooks.** _(Owner: Platform)_
  - Notes:
- ☐ **Expand Terraform/infra automation for AWS, Vercel, Mongo Atlas, Redis, Cloudflare with secrets management.** _(Owner: DevOps)_
  - Notes:
- ☐ **Document security reviews, data retention policies, and compliance checklists.** _(Owner: Compliance)_
  - Notes:

## 8. PWA Polish & Launch Readiness
- ☐ **Ship manifest, service worker (offline caching), and installation prompts with responsive app shell.** _(Owner: Frontend)_
  - Notes:
- ☐ **Conduct end-to-end, load, and resilience testing; document results.** _(Owner: QA)_
  - Notes:
- ☐ **Prepare rollout plan (staging validation, go-live checklist, incident response).** _(Owner: DevOps)_
  - Notes:
- ☐ **Ensure design system covers responsive components (buttons, forms, modals, navigation) across desktop/mobile.** _(Owner: Design)_
  - Notes:

---

## Cross-Cutting Documentation Checklist
- ☐ Maintain architecture decision records for major changes.
- ☐ Keep `APPLICATION_FLOW.md` synchronized with new routes and mobile/desktop UX behavior.
- ☐ Update README with setup changes, internal auth instructions, and responsive design guidelines.
- ☐ Archive TikTok and M-Pesa compliance artifacts in shared drive; log links here when added.

---

## Backlog Parking Lot
Record future ideas or stretch goals with owner + context for future grooming.

- _(Add entries in the format: **Idea** — Owner — Context/Notes)_


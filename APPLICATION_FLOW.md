# TrendPot Experience Flow & Data Reference

This document is the single source of truth for how TrendPot is wired end-to-end today and where it is heading. Frontend engineers should treat it as the living blueprint for navigation structure, data contracts, and integration touchpoints. Update this file whenever flows or contracts change.

## Table of contents
1. [Architecture snapshot](#architecture-snapshot)
2. [Navigation & page flows](#navigation--page-flows)
   * [Global layout](#global-layout)
   * [Home page (`/`)](#home-page-)
   * [Upcoming routes](#upcoming-routes)
3. [Data fetching & contracts](#data-fetching--contracts)
   * [GraphQL access layer](#graphql-access-layer)
   * [Featured challenge pipeline](#featured-challenge-pipeline)
   * [Operational endpoints](#operational-endpoints)
   * [Background processing](#background-processing)
4. [Admin & operations experience](#admin--operations-experience)
5. [Key gaps to address](#key-gaps-to-address)
6. [Future evolution log](#future-evolution-log)

---

## Architecture snapshot

* **Frontend:** Next.js App Router PWA in `apps/web` with React Query for client-side caching and `@trendpot/ui` components for visual primitives.
* **API:** NestJS GraphQL service in `apps/api` exposing read/write models via `/graphql`. Data persists in MongoDB through the `ChallengeEntity` schema (see `apps/api/src/models/challenge.schema.ts`).
* **Worker:** BullMQ worker in `apps/worker` orchestrates leaderboard generation, validating payloads with `@trendpot/types` schemas and using retry helpers from `@trendpot/utils`.
* **Shared contracts:** `@trendpot/types` centralises Zod schemas, generated GraphQL documents, and a thin GraphQL client wrapper consumed by the web app.

---

## Navigation & page flows

### Global layout
* File: `apps/web/src/app/layout.tsx`
* Responsibilities:
  * Provides HTML shell, global metadata, and `<body>` styling.
  * Wraps children with `Providers` component that instantiates React Query context (see `apps/web/src/app/providers.tsx`).
  * Ensures consistent typography, background, and spacing across pages.
* Future hooks:
  * Reserve slots for global navigation, notifications, and authenticated user menus once account flows land.

### Home page (`/`)
* File: `apps/web/src/app/page.tsx`
* Server flow:
  * Instantiates a `QueryClient` per request.
  * Prefetches `featuredChallenges` via `featuredChallengesQueryOptions()` and dehydrates cache to inline into HTML.
* Client flow (`HomeContent` in `apps/web/src/components/home/home-content.tsx`):
  1. Hydrates cached query and keeps it fresh for 30 seconds.
  2. Renders **Campaign Pulse** summary card with static KPI placeholders (active challenges, submissions, donations).
  3. Renders **Featured challenges** section containing:
     * CTA card “Launch your first campaign” that links to the admin creation route at `/admin/challenges/new`.
     * Dynamic list of challenge cards or skeleton/error states depending on fetch status.
     * “View all” link to `/challenges` for the full catalog (now implemented).
     * Per-card “View insights” link to `/c/{challengeId}` for detail view (implemented below).
  4. Error handling surfaces GraphQL issues with a retry button powered by React Query `refetch`.
* Interaction states to preserve:
  * Keep skeleton placeholders equal to `FEATURED_CHALLENGE_LIMIT` to avoid layout shift.
  * Maintain currency formatting fallback so unsupported ISO codes gracefully render.

### Challenges catalog (`/challenges`)
* File: `apps/web/src/app/challenges/page.tsx`
* Server flow:
  * Prefetches `challengesQueryOptions()` without filters so the initial list renders during SSR.
* Client flow (`ChallengesContent` in `apps/web/src/components/challenges/challenges-content.tsx`):
  1. Hydrates the challenge list cache and displays skeletons while pending.
  2. Surfaces retry affordances on GraphQL failure.
  3. Shows empty-state messaging that routes admins to the creation workflow when no campaigns exist.
  4. Renders cards with progress bars, currency formatting, and navigation to `/c/{id}`.

### Challenge detail (`/c/[id]`)
* File: `apps/web/src/app/c/[id]/page.tsx`
* Server flow:
  * Uses `challengeQueryOptions(id)` to fetch detail data; invokes `notFound()` when the challenge is missing.
* Client flow (`ChallengeDetail` in `apps/web/src/components/challenges/challenge-detail.tsx`):
  1. Displays load, error, and not-found states with retry affordances.
  2. Formats raised vs goal totals from integer cents and computes progress percentage.
  3. Exposes narrative copy, status badge, and operational metadata (currency, timestamps).

### Admin creation (`/admin/challenges/new`)
* File: `apps/web/src/app/admin/challenges/new/page.tsx`
* Client flow (`CreateChallengeForm` in `apps/web/src/components/admin/create-challenge-form.tsx`):
  1. Allows admins to define slug, title, tagline, description, fundraising goal, currency, and status.
  2. Converts goals entered in major currency units to integer cents before mutation submission.
  3. Calls the `createChallenge` GraphQL mutation and hydrates React Query caches (`featured`, `challenges`, and detail) on success before redirecting to `/c/{id}`.
  4. Validates inputs inline and surfaces mutation errors to the operator.

### Upcoming routes
These routes are referenced in the UX but missing page files. Treat them as highest-priority gaps for frontend enablement.

| Route | Purpose | Notes |
| --- | --- | --- |
| `/donate/[submissionId]` | Not linked yet, but planned for direct donation flow per sprint plan. | Blocked on M-Pesa integration & secure form handling. |
| `/me` | Account dashboard for admins/creators. | Requires auth wiring (Clerk) and role-based content. |

---

## Data fetching & contracts

### GraphQL access layer
* Client wrapper: `TrendPotGraphQLClient` in `packages/types/src/graphql-client.ts`.
  * Configures base URL via `NEXT_PUBLIC_API_URL` → `API_BASE_URL` → fallback `http://localhost:4000` (`apps/web/src/lib/api-client.ts`).
  * Enforces JSON content-type, surfaces GraphQL errors, and validates responses with Zod before returning to callers.
* Query options: `featuredChallengesQueryOptions()`, `challengesQueryOptions()`, and `challengeQueryOptions(id)` centralise query keys/fetchers so pages share cached data. `createChallengeMutation` exposes the mutation hook wrapper.

### Featured challenge pipeline
1. **Frontend query (React Query)**
   * `fetchFeaturedChallenges()` executes GraphQL query `FeaturedChallenges(status, limit)` with default params `{ status: "live", limit: 6 }` (`apps/web/src/lib/challenge-queries.ts`).
   * Cache key: `["challenges", "featured", { status: "live", limit: 6 }]` to scope invalidations.
2. **GraphQL transport**
   * POST to `${baseUrl}/graphql` with request body containing query + variables.
   * Response validated against `featuredChallengesDataSchema`; errors bubble up to UI.
3. **API resolver**
   * `ChallengeResolver` in `apps/api/src/challenge.resolver.ts` maps arguments to `ListChallengesParams` and delegates to `AppService`.
4. **Service layer**
  * `AppService` queries MongoDB via `ChallengeEntity` using optional status + limit filters and maps documents to `ChallengeSummary` projections.
  * `createChallenge` normalises slugs, stores goal/raised totals in integer cents, and enforces uniqueness before persisting.

### Challenge detail pipeline
1. **Frontend query (React Query)**
   * `challengeQueryOptions(id)` fetches the `Challenge` document for detail views; returns `null` when not found so the server can trigger `notFound()`.
2. **GraphQL transport**
   * Uses the `Challenge` document in `packages/types/src/graphql-client.ts`, returning description, status, and ISO timestamps validated via Zod.
3. **API resolver**
   * `ChallengeResolver.challenge` delegates to `AppService.getChallenge(id)` which normalises the slug and reads from MongoDB.
4. **Service layer**
   * Maps Mongo documents to the richer `Challenge` contract (summary fields + description/status/timestamps) before returning to the resolver.

### Operational endpoints
* `health` query (`apps/api/src/health.resolver.ts`) returns `{ status, service, uptime }`; useful for uptime monitors and dashboards.
* Plan to surface additional observability fields (e.g., dependency health) as infra matures.

### Background processing
* `apps/worker/src/index.ts` boots a BullMQ worker bound to Redis (`REDIS_URL`).
* Processes `leaderboard` jobs, constructing payload validated by `challengeLeaderboardSchema` (see `@trendpot/types/src/leaderboard.ts`).
* Wraps job handler in `withRetries` helper from `@trendpot/utils` for resilient execution and logs success/failure events.
* Downstream consumers (e.g., `/c/[id]` insights) will eventually subscribe to this data; ensure contract remains stable as UI adds leaderboard sections.

---

## Admin & operations experience

* **Current state**
  * `/admin/challenges/new` provides a form-driven workflow that calls the `createChallenge` mutation and persists data to MongoDB.
  * React Query caches for featured, list, and detail views hydrate immediately after mutation so admins land on the new detail page.
  * No authentication, role management, or challenge editing flows exist yet.
* **Planned direction**
  * `/me` dashboard for authenticated creators/admins to manage campaigns.
  * Challenge editing + archiving mutations, plus status transitions that gate inclusion in featured feeds.
  * Integration with BullMQ leaderboards and M-Pesa donation telemetry for operations staff.

---

## Key gaps to address

1. **Harden admin workflows**
   * Add authentication + role checks around `/admin/challenges/new`.
   * Ship edit/archive mutations so admins can iterate on existing challenges.
2. **Bring donations end-to-end**
   * Implement `/donate/[submissionId]` with M-Pesa STK push, webhook confirmations, and optimistic UI states.
3. **Layer analytics onto challenge detail**
   * Surface leaderboard, submission metrics, and donation history on `/c/[id]` by wiring the BullMQ worker outputs and future telemetry feeds.

Keep these items visible in sprint planning until shipped; update this section with owner + status tags as work progresses.

---

## Future evolution log

Use this section to capture planned or in-flight adjustments so teams stay aligned.

| Date | Owner | Change | Status |
| --- | --- | --- | --- |
| _(add row)_ | _(name)_ | _(e.g., "Introduce challenge detail query with engagement stats")_ | _(Planned/In progress/Done)_ |

> **Maintenance reminder:** When you add new flows, routes, or data sources, update the relevant sections above and record a log entry here.

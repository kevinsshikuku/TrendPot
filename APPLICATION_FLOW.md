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
* **API:** NestJS GraphQL service in `apps/api` exposing read models via `/graphql`. Data is currently sourced from an in-memory seed (`demoChallenges`).
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
     * CTA card “Launch your first campaign” with a disabled/placeholder CTA (no admin workflow exists yet).
     * Dynamic list of challenge cards or skeleton/error states depending on fetch status.
     * “View all” link to `/challenges` for the full catalog (route not implemented yet; currently 404s).
     * Per-card “View insights” link to `/c/{challengeId}` for detail view (route not implemented yet; currently 404s).
  4. Error handling surfaces GraphQL issues with a retry button powered by React Query `refetch`.
* Interaction states to preserve:
  * Keep skeleton placeholders equal to `FEATURED_CHALLENGE_LIMIT` to avoid layout shift.
  * Maintain currency formatting fallback so unsupported ISO codes gracefully render.

### Upcoming routes
These routes are referenced in the UX but missing page files. Treat them as highest-priority gaps for frontend enablement.

| Route | Purpose | Notes |
| --- | --- | --- |
| `/challenges` | Browse full challenge catalog. | Link exists from home page; implement page + React Query list view so navigation resolves. |
| `/c/[id]` | Challenge detail with metrics and storytelling. | Cards link here; add detail page with loading/error/not-found handling. |
| `/admin/challenges/new` | Admin challenge creation workflow. | Wire “Launch your first campaign” CTA into a real form + mutation flow once backend is ready. |
| `/donate/[submissionId]` | Direct donation flow per sprint plan. | Blocked on M-Pesa integration & secure form handling. |
| `/me` | Account dashboard for admins/creators. | Requires auth wiring (Clerk) and role-based content. |

---

## Data fetching & contracts

### GraphQL access layer
* Client wrapper: `TrendPotGraphQLClient` in `packages/types/src/graphql-client.ts`.
  * Configures base URL via `NEXT_PUBLIC_API_URL` → `API_BASE_URL` → fallback `http://localhost:4000` (`apps/web/src/lib/api-client.ts`).
  * Enforces JSON content-type, surfaces GraphQL errors, and validates responses with Zod before returning to callers.
* Query options: `featuredChallengesQueryOptions()` centralises query keys/fetcher so pages share cached data once new routes ship.

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
   * `AppService.getFeaturedChallenges()` returns the in-memory `demoChallenges` array filtered by status and limited by the request parameter.
   * Persistence is not yet wired; replacing the in-memory source with MongoDB is a key follow-up.

### Operational endpoints
* `health` query (`apps/api/src/health.resolver.ts`) returns `{ status, service, uptime }`; useful for uptime monitors and dashboards.
* Plan to surface additional observability fields (e.g., dependency health) as infra matures.

### Background processing
* `apps/worker/src/index.ts` boots a BullMQ worker bound to Redis (`REDIS_URL`).
* Processes `leaderboard` jobs, constructing payload validated by `challengeLeaderboardSchema` (see `@trendpot/types/src/leaderboard.ts`).
* Wraps job handler in `withRetries` helper from `@trendpot/utils` for resilient execution and logs success/failure events.
* Downstream consumers (e.g., future `/c/[id]` insights) will eventually subscribe to this data; ensure contract remains stable as UI adds leaderboard sections.

---

## Admin & operations experience

* **Current state**
  * Home page teases administrative capabilities via “Launch your first campaign,” but the CTA is not yet wired to a route or mutation.
  * No authentication, role management, or challenge editing flows exist yet.
  * Administrators cannot seed or curate campaigns without editing source code.
* **Planned direction**
  * Ship `/admin/challenges/new` page and GraphQL mutations to create/manage challenges with proper validation.
  * Introduce `/me` dashboard for authenticated creators/admins to manage campaigns.
  * Integrate BullMQ leaderboards and M-Pesa donation telemetry for operations staff.

---

## Key gaps to address

1. **Implement navigation destinations**
   * Build `/challenges` and `/c/[id]` pages so existing links resolve and use React Query to hydrate list/detail data.
   * Wire the “Create challenge” CTA to a real admin workflow at `/admin/challenges/new`.
2. **Replace demo data with persistence**
   * Swap the in-memory `demoChallenges` seed for MongoDB storage, exposing list/detail queries plus admin mutations.
   * Author management UIs so administrators can seed and curate challenges without code edits.
3. **Bring donations end-to-end**
   * Implement `/donate/[submissionId]` with M-Pesa STK push, webhook confirmations, and optimistic UI states.
   * Layer analytics onto `/c/[id]` once persistence and worker integrations land.

Keep these items visible in sprint planning until shipped; update this section with owner + status tags as work progresses.

---

## Future evolution log

Use this section to capture planned or in-flight adjustments so teams stay aligned.

| Date | Owner | Change | Status |
| --- | --- | --- | --- |
| _(add row)_ | _(name)_ | _(e.g., "Introduce challenge detail query with engagement stats")_ | _(Planned/In progress/Done)_ |

> **Maintenance reminder:** When you add new flows, routes, or data sources, update the relevant sections above and record a log entry here.

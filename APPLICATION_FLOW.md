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
  4. Error handling surfaces GraphQL issues with a retry button powered by React Query `refetch`.
* Interaction states to preserve:
  * Keep skeleton placeholders equal to `FEATURED_CHALLENGE_LIMIT` to avoid layout shift.
  * Maintain currency formatting fallback so unsupported ISO codes gracefully render.

### Authentication flows (`/login`, `/signup`, `/auth/verify`)
* Files: `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/app/(auth)/signup/page.tsx`, `apps/web/src/app/auth/verify/page.tsx`
* Responsibilities:
  * Render passwordless enrollment/login experiences with responsive cards, adaptive typography, and sticky call-to-action buttons on mobile viewports.
  * Use React Query mutations that call internal API routes (`/api/auth/request-otp`, `/api/auth/verify-otp`) which proxy GraphQL auth mutations, forward Fastify cookies, and capture viewer/session payload cookies for subsequent requests.
  * Respect the `next` query param propagated by middleware so successful verifications return viewers to their original destination.
* Client flow:
  1. User submits email (and display name for signup); `requestEmailOtp` mutation posts to `/api/auth/request-otp` and navigates to `/auth/verify` with challenge metadata.
  2. OTP form enforces numeric entry, sends `{ email, otpCode, token, deviceLabel }` to `/api/auth/verify-otp`, and redirects to `/account` or the sanitised `next` path on success.
  3. Error states surface toast-style inline banners; CTAs remain sticky on small screens and copy scales with Tailwind responsive tokens.
* Session management:
  * API routes persist `trendpot.user` / `trendpot.session` cookies (base64-encoded viewer + session payload) and forward server-set session/refresh cookies for the NestJS service.
  * `apps/web/middleware.ts` enforces login for `/account` and `/admin` routes, redirects unauthenticated users back through `/login?next=…`, and blocks non-admin roles with a friendly `/account?error=forbidden` banner.
* Validation coverage: `apps/api/src/platform-auth.e2e.test.ts` exercises the passwordless registration/login flow, ensures refresh-token hashing matches issued cookies, and asserts admin mutations remain role-gated.

### Account dashboard (`/account`, `/me`)
* File: `apps/web/src/app/account/page.tsx`
* Routing: `/me` is fulfilled by the same App Router page via a thin alias so links in documentation and legacy designs resolve without duplication.
* Server flow:
  * Uses `loadViewerOnServer()` and `loadViewerSessionsOnServer()` helpers to invoke the GraphQL client with request cookies/headers.
  * Redirects unauthenticated viewers to `/login`.
  * Seeds React Query cache with dehydrated viewer + session queries before rendering.
* Client flow (`AccountDashboard`):
  * Hydrates viewer + sessions queries, renders identity overview tiles, and lists active sessions with revoke/sign-out actions.
  * Calls `/api/auth/logout` for current-session sign out and `/api/auth/sessions/[id]` for remote revocation; both routes proxy GraphQL mutations and manage cookies consistently.
  * Highlights the current device, presents metadata (device label, IP, risk level) from session payloads, and exposes a mobile drawer with revoke/sign-out actions when screen width is below the `sm` breakpoint.

### Upcoming routes
At this time there are no additional auth routes blocked. Future UX work will focus on donations, creator onboarding, and admin tooling.

---

## Data fetching & contracts

### GraphQL access layer
* Client wrapper: `TrendPotGraphQLClient` in `packages/types/src/graphql-client.ts`.
  * Configures base URL via `NEXT_PUBLIC_API_URL` → `API_BASE_URL` → fallback `http://localhost:4000` (`apps/web/src/lib/api-client.ts`).
  * Enforces JSON content-type, surfaces GraphQL errors, and validates responses with Zod before returning to callers.
  * Auth helpers: `requestEmailOtp`, `verifyEmailOtp`, `getViewer`, `getViewerSessions`, `logoutSession`, and `revokeSession` now expose GraphQL mutations/queries for platform auth; Next API routes consume these to bridge cookies between Fastify and the browser.

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


### Operational endpoints
* `health` query (`apps/api/src/health.resolver.ts`) returns `{ status, service, uptime }`; useful for uptime monitors and dashboards.
* Plan to surface additional observability fields (e.g., dependency health) as infra matures.

### Background processing
* `apps/worker/src/index.ts` boots a BullMQ worker bound to Redis (`REDIS_URL`).
* Processes `leaderboard` jobs, constructing payload validated by `challengeLeaderboardSchema` (see `@trendpot/types/src/leaderboard.ts`).
* Wraps job handler in `withRetries` helper from `@trendpot/utils` for resilient execution and logs success/failure events.


---

## Admin & operations experience

* **Current state**

---

## Key gaps to address


Keep these items visible in sprint planning until shipped; update this section with owner + status tags as work progresses.

---

## Future evolution log

Use this section to capture planned or in-flight adjustments so teams stay aligned.

| Date | Owner | Change | Status |
| --- | --- | --- | --- |
| _(add row)_ | _(name)_ | _(e.g., "Introduce challenge detail query with engagement stats")_ | _(Planned/In progress/Done)_ |

> **Maintenance reminder:** When you add new flows, routes, or data sources, update the relevant sections above and record a log entry here.

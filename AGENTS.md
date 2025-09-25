
## 0) Golden Rules (Read First)

1. **Respect team boundaries**

   * **Frontend owns:** `apps/web` + `packages/ui`. Only call the API via the generated GraphQL client in `packages/types`. **No cross‑imports** from API.
   * **Backend owns:** `apps/api` (NestJS), `apps/worker` (BullMQ), webhooks, queues.
2. **Contract‑first:** Any API change updates the GraphQL schema SDL → CI enforces **schema diff + persisted query checks** (no breaking changes on PR).
3. **Security & Compliance:**

   * TikTok: **Display API** + **oEmbed** only, with creator consent. No scraping or unofficial APIs.
   * M‑Pesa: **Daraja STK Push** only for donations; verify webhook signatures; all writes idempotent.
   * Encrypt OAuth tokens at rest (AES‑256‑GCM via KMS); verify all webhooks; rate‑limit sensitive endpoints.
4. **Data:** MongoDB Atlas is the primary store (multi‑region, sharded per plan). Use **ObjectId** FKs. Prefer referencing over deep embedding. Use **keyset pagination**.
5. **Money:** Store amounts as **integer cents** (KES×100). No floats. See §15.1–15.8.
6. **Observability:** Instrument traces (OTel), log with request IDs, capture metrics; Sentry for errors; PostHog for product events.
7. **Definition of Done (DoD):** All checklists in this doc pass; tests green; GraphQL schema + generated artifacts updated; PWA passes installability; CI green; dashboards/alerts updated if behavior changes.

---

## 1) Repo Layout & Ownership

```
/ (turborepo)
  apps/
    web/                # Next.js PWA (frontend)
    api/                # NestJS service (backend)
    worker/             # BullMQ consumers & schedulers
  packages/
    ui/                 # Shared React UI library
    types/              # GraphQL documents, TS types + Zod schemas
    config/             # ESLint, tsconfig, tailwind preset
    utils/              # Shared utilities (dates, money, fetch)
  infra/
    terraform/          # AWS + Atlas + Cloudflare IaC
    vercel/             # vercel.json, headers
  .github/workflows/    # CI pipelines
```

**Rules:** FE uses only GraphQL via `packages/types` client; all UI primitives live in `packages/ui`; flags/constants in `packages/utils`.

---

## 2) Local Dev Bootstrap (Agent Playbook)

**Prereqs:** Node 20 LTS, pnpm ≥9, Docker Desktop/Engine, Git, OpenSSL.

```bash
# 2.1 Clone & install
pnpm i --frozen-lockfile

# 2.2 Bring up local deps (Mongo, Redis, mailhog optional)
docker compose up -d

# 2.3 Seed & ensure indexes (idempotent scripts)
pnpm -w run db:init     # creates indexes, validators

# 2.4 Generate GraphQL artifacts (first time and whenever the schema changes)
pnpm -w run graphql:gen

# 2.5 Dev everything (concurrently)
pnpm -w run dev         # runs web/api/worker together (see package.json)

# 2.6 QA checks locally
pnpm -w run lint && pnpm -w run typecheck && pnpm -w run test
```

**Environment Files (create):**

* `apps/api/.env.local`
* `apps/worker/.env.local`
* `apps/web/.env.local`
* `packages/utils/.env.local` (if needed for shared values)

**Minimum vars (placeholders):**

```ini
# Common
NODE_ENV=development
LOG_LEVEL=debug
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
SENTRY_DSN=
POSTHOG_KEY=

# Auth Service
AUTH_SESSION_TOKEN_SECRET=dev-session-token
AUTH_REFRESH_HASH_SECRET=dev-refresh-hash
AUTH_SESSION_TTL_HOURS=24
AUTH_REFRESH_TTL_DAYS=14
AUTH_SESSION_COOKIE_NAME=trendpot.sid
AUTH_REFRESH_COOKIE_NAME=trendpot.refresh

# Mongo
MONGODB_URI=mongodb://localhost:27017/trendpot
MONGODB_DB=trendpot

# Redis
REDIS_URL=redis://localhost:6379

# TikTok Display API (OAuth handled server‑side)
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=http://localhost:3000/api/tiktok/callback
TIKTOK_TOKEN_ENC_KEY_ID=<kms-key-id>

# M‑Pesa Daraja (Sandbox)
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORT_CODE=
MPESA_PASSKEY=
MPESA_CALLBACK_URL=http://localhost:4000/webhooks/mpesa/stkpush

# Web Push (VAPID)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:dev@trendpot.app

# CORS/Origin
ALLOWED_ORIGINS=http://localhost:3000
```

**Keys:**

```bash
# Generate VAPID keys once
node -e "const webpush=require('web-push');const v=webpush.generateVAPIDKeys();console.log(v)"
```

---

## 3) Data Model & Indexes (MongoDB Atlas)

Use Mongoose 8 schemas + MongoDB **JSON Schema validators**. Default IDs are **ObjectId**. Create indexes in code and ensure on boot.

**Collections & Indexes (short):**

* `users` — `{ email, phone, roles[], status, displayName, metadata, audit }`
  Indexes: unique `{email:1}`, unique sparse `{phone:1}`
* `sessions` — `{ userId, rolesSnapshot, issuedAt, expiresAt, refreshTokenHash, ipAddress, userAgent, metadata }`
  Indexes: unique `{refreshTokenHash:1}`, compound `{userId:1,issuedAt:-1}`, TTL `{expiresAt:1}`
* `audit_logs` — `{ actorId, actorRoles, action, targetId, context, severity, createdAt }`
  Indexes: compound `{actorId:1,createdAt:-1}`, text `{context.summary:"text"}`
* `tiktok_accounts` — OAuth tokens (encrypted), `{ userId, openId, ... }`
  Indexes: `{userId:1}`, unique `{openId:1}`
* `videos` — TikTok video refs + metrics
  Indexes: unique `{tiktokVideoId:1}`, `{ownerTikTokAccountId:1, postedAt:-1}`
* `challenges` — `{ slug, name, hashtag, rulesMd, ... }`
  Indexes: unique `{slug:1}`, `{status:1, startsAt:-1}`
* `submissions` — connects `challenge→video→user` with state
  Indexes: `{challengeId:1, state:1, _id:-1}`, `{userId:1, challengeId:1}`
* `leaderboards` — `{challengeId, computedAt}`
  Indexes: `{challengeId:1, computedAt:-1}`
* `leaderboard_entries` — `{ leaderboardId, submissionId, score, rank }`
  Indexes: `{leaderboardId:1, rank:1}`, `{submissionId:1}`
* `donations` — STK Push lifecycle
  Indexes: `{submissionId:1, _id:-1}`, `{donorUserId:1, _id:-1}`, unique `{mpesaCheckoutRequestId:1}`
* `payouts`, `webhook_events`, `audit_logs`, `rate_limits` (see full spec in README/Models).

**Sharding (Atlas):**

* `submissions` shard on `{challengeId: 'hashed'}`
* `leaderboard_entries` shard on `{leaderboardId: 'hashed'}`
* `donations` shard on `{submissionId: 'hashed'}` (or `{creatorUserId:'hashed'}` if payout‑heavy)

**Pagination:** keyset using `_id` (or `createdAt`) with `{ _id: { $lt: lastId } }`.

---

## 4) External Integrations (Responsibilities)

* **TikTok Display API**: Server‑side OAuth (PKCE), encrypted tokens in `tiktok_accounts`. Endpoints to fetch creator videos/metrics during submission and on refresh cycles.
* **TikTok oEmbed**: Backend proxy `GET /embed?url=...` → sanitize HTML → FE renders `<TikTokEmbed/>`.
* **M‑Pesa Daraja (STK Push)**: `requestStkPush` GraphQL mutation initiates; webhook `POST /webhooks/mpesa/stkpush` verifies + idempotently updates `donations`.

---

## 5) API (GraphQL Schema)

**Contract:** Code-first schema via Nest GraphQL decorators + Zod DTOs. SDL is checked into git (`apps/api/schema.gql`).
`packages/types` publishes typed documents + Zod validation for each approved operation. Run `pnpm -w run graphql:gen` whenever
schema or documents change.

**Core Queries:**

* `health` → service uptime, used by probes.
* `me` → profile + linked TikTok account + donation totals.
* `featuredChallenges(status, limit)` → hero grid feed.
* `challenge(id)` → challenge detail (includes metrics + leaderboard preview fields).
* `challengeSubmissions(id, state, after, first)` → moderator + creator lists with keyset pagination.
* `challengeLeaderboard(id, first, after)` → leaderboard connection.
* `creatorVideos(after)` → TikTok library for submission flow.
* `donation(id)` → donation status for polling.
* `creatorDonations(creatorId, after)` → earnings history.
* `adminReports`, `adminSummary`, `adminAuditLog`, `adminDonations` → admin dashboards.

**Mutations:**

* `startTikTokOAuth`, `completeTikTokOAuth`.
* `submitToChallenge`, `moderateSubmission`, `upsertChallenge`, `publishChallenge`.
* `requestStkPush` (M-Pesa), `flagSubmission` (admin), `updateNotificationPrefs`.

**Conventions:** GraphQL errors include `extensions.code` (match `E_*` glossary). Always echo `x-request-id` header; sanitize outputs; inputs validated via Zod before resolver logic.

---

## 6) Ranking Service (Deterministic & Explainable)

**Score:**

```
score = 0.50*(views/hour) + 0.25*(likes/hour) + 0.15*(comments/hour) + 0.10*(shares/hour)
       + recencyBoost (if video < 48h old)
```

**Process:** Worker runs every 10 min per live challenge; aggregates from `videos` joined via `submissions`; writes `leaderboards` + `leaderboard_entries` in a **transaction**; emits `leaderboard:update` on Redis Pub/Sub; cache Top 3 in Redis (TTL 60s).

**Anti‑abuse:** Cap extreme deltas (p99), flag anomalies into `admin/reports`.

---

## 7) Background Jobs & Scheduling (BullMQ)

Queues: `tokenRefresh`, `videoSync`, `leaderboard`, `donationRecon`, `dlqHandler`.

* `tokenRefresh`: renew TikTok tokens <24h to expiry
* `videoSync`: pull metrics for opted‑in creators during active challenges
* `leaderboard`: compute + cache Top 3 (TTL 60s)
* `donationRecon`: daily reconciliation
* `dlqHandler`: drain dead‑letters with alerting

---

## 8) Caching & Performance

* **Redis:** cache `challengeLeaderboard` top3 slice for 60s; invalidate on leaderboard compute.
* **HTTP/CDN:** `s-maxage=60, stale-while-revalidate=120` for public reads.
* **Mongo:** nearest read preference; tuned `maxPoolSize` via load tests.
* **Pagination:** keyset only (never offsets).

---

## 9) PWA: Installability, Offline, Push

* **Manifest v3:** `name`, `short_name`, icons, `start_url='/'`, `display='standalone'`, theme colors.
  * **Service Worker (Workbox):**
  
    * `StaleWhileRevalidate` for app shell
    * `CacheFirst` for static assets
    * `NetworkFirst` for JSON (small TTL)
    * **Background Sync:** queue failed `requestStkPush` mutations and retry
* **Web Push:**

  * VAPID keys (see §2); store user subscriptions under `users.notifications`
  * Topics: `challenge:<id>`, `donation:<id>`; server sends on leaderboard change, donation status, challenge publish
  * Install UX: custom `beforeinstallprompt` flow + in‑app banner

---

## 10) Frontend (Next.js) — Pages & Data Sources

**Rule:** Every page declares its data source (our API).

**Public**

1. `/` Home — Featured live challenges
   Data: `featuredChallenges(status: "live", limit: 6)` query → open challenge → `/c/[slug]`
2. `/challenges` Explore — Filters + infinite scroll
   Data: `challenges(first, after, filters)` query
3. `/c/[slug]` Challenge Details — Hero, rules, Top 3 (real‑time), full leaderboard
   Data: `challenge(id)`, `challengeLeaderboard(id, first)`, `challengeSubmissions(id, state, after)`
   Realtime: subscribe to `leaderboard:update`
4. `/s/[submissionId]` Submission Detail — TikTok embed + metrics + donation widget
   Data: `submission(id)` + oEmbed HTML via API proxy

**Authenticated**
5\. `/join` Creator flow — connect TikTok if needed → select video → submit to challenge
Data: `creatorVideos(after)` query
6\. `/connect/tiktok` — OAuth start/callback → `/me`
7\. `/me` Profile — Submissions, donations, TikTok status
Data: `me`, `creatorDonations(creatorId, after)` queries
8\. `/donate/[submissionId]` Donate — STK Push (phone + amount)
Action: `requestStkPush` mutation; Status: poll `donation(id)` query or SSE/WS
9\. `/notifications` — Manage push topics
Data: `me` query + `updateNotificationPrefs` mutation

**Admin**
10\. `/admin` Dashboard tiles (lag, queues, errors)
11\. `/admin/challenges` CRUD/publish
12\. `/admin/submissions` Review queue
13\. `/admin/donations` Reconciliation
14\. `/admin/audit` Security log

**Shared UI Library (`packages/ui`)**

* Primitives: Button, Input, Select, Modal, Card, Tabs, Toast, Badge, Pagination, EmptyState, Skeleton
* Features: TikTokEmbed, DonationWidget, ChallengeCard, SubmissionCard, LeaderboardList, MetricChip

---

## 11) Frontend Implementation Details

* Data: React Query; invalidate on `leaderboard:update`.
* Local state: Zustand (UI only).
* API client: GraphQL documents + Zod schemas exported from `packages/types`.
* Accessibility: Radix, ARIA roles, keyboard nav.
* Responsive: Tailwind breakpoints; components expose `variant` props.
* Analytics: PostHog events (`donation_started/succeeded`, `join_started/submitted`, ...).
* Error boundaries + skeletons everywhere.

**PWA checks:**

```bash
# Lighthouse PWA category ≥90; must be installable, offline‑tolerant
pnpm -w run pwa:check
```

---

## 12) Backend Implementation Details (NestJS + Mongoose)

* **Modules:** `Auth`, `Users`, `TikTok`, `Challenges`, `Submissions`, `Leaderboards`, `Donations`, `Webhooks`, `Admin`.
* **Providers:** `MongoProvider`, `RedisProvider`, `BullProvider`, `TikTokClient`, `MpesaClient`.
* **Guards/Interceptors:** `ClerkJwtGuard`, `RoleGuard`, `RateLimit (Redis)`, `RequestId`, `Logging`.
* **DTO Validation:** Zod mapped to GraphQL input/output types via Nest decorators.
* **Transactions:** Use `withTransaction` for donation + ledger writes (timeout 5s). Keep transactions tiny.
* **Bulk ops:** `bulkWrite` for leaderboard entry upserts.
* **Security:** AES‑256‑GCM token encryption (KMS from Secrets Manager), signed webhooks, HSTS, strict CORS.

---

## 13) Payments & Accounting (M‑Pesa Daraja)

### 13.1 STK Push Flow (Happy Path)

1. FE executes `requestStkPush { submissionId, amountKES, phoneE164 }` mutation.
2. API validates, computes `amountCents = round(amountKES*100)`, creates `donations{status:'pending'}` with **idempotency key** `hash(msisdn+submissionId+minute)`; returns `donationId` via GraphQL payload.
3. API calls Daraja `processrequest` (Password=Base64(ShortCode+Passkey+Timestamp)).
4. Daraja prompts user; on success, Daraja **webhooks** to `/webhooks/mpesa/stkpush`.
5. Webhook verifies signature + matches `mpesaCheckoutRequestId`; in a **transaction**:

   * mark donation `paid|failed`
   * compute distribution (§13.3)
   * post **double‑entry** journal (§13.4)
   * credit creator wallet
6. Emit Redis `donation:update` + push notification; FE updates status.

### 13.2 Idempotency & Recon

* **Idempotency:** Unique `mpesaCheckoutRequestId`, unique `(eventType,eventRefId)` journal batch, idempotency key on API.
* **Reconciliation (daily):** import statements → `mpesa_transactions`; match by `checkoutRequestId+amount`; book fees when known (§13.5).

### 13.3 Distribution (70/30 with VAT on Commission)

```
commissionGross = floor(A * 0.30)
vat             = round( commissionGross * r / (1 + r) )
commissionNet   = commissionGross - vat
creatorShare    = A - commissionGross
assert creatorShare + commissionNet + vat == A
```

Persist all on the donation doc.

### 13.4 Posting Rules (Double‑Entry)

* **Donation SUCCESS:**

  * Dr `1000 Cash:MpesaPaybill` = A
  * Cr `2000 Liability:CreatorsPayable` = creatorShare
  * Cr `2100 Liability:TaxesPayable:VATOutput` = vat
  * Cr `4000 Revenue:PlatformCommission` = commissionNet
  * Sub‑ledgers: credit creator wallet (availableCents); record company revenue.
* **Fees, Payouts, Reversals:** see full chart/accounts & rules in §15.

### 13.5 Monetary Types

* Use **integers** (`amountCents`) for storage; `Decimal` for arithmetic; HALF‑UP rounding on display only.

---

## 14) Workflows (Step‑by‑Step Playbooks)

### A) Add/Change a GraphQL Operation

1. **Spec first:** Update GraphQL decorators + Zod DTOs in `apps/api` resolvers. Keep changes backwards compatible (no breaking schema diffs).
2. **Generate FE artifacts:** `pnpm -w run graphql:gen` → commit changes in `packages/types`.
3. **Implement service:** Adjust resolvers/services; add Mongoose models/queries; add indexes if needed.
4. **Tests:** Unit (Vitest), integration (GraphQL e2e via Mercurius testing + Mongoose memory server). Cover error paths and pagination.
5. **Docs:** Update schema docs/README sections; capture example queries/mutations + expected errors (`extensions.code`).
6. **CI:** PR must pass **GraphQL schema diff + persisted query checks**, lint, typecheck, tests.
7. **FE usage:** Consume via generated GraphQL client; add React Query hooks; wire loading/skeletons.

### B) Add a New Page (FE)

1. Create route in App Router; add layout/head metadata.
2. Define **data sources** (API calls). Create React Query hook(s).
3. Use shadcn/ui + `packages/ui` primitives; add a11y (Radix) and responsive variants.
4. Add analytics events; add error boundary + skeleton.
5. PWA: ensure caching strategy manageable; declare any Background Sync needs.
6. Tests: component tests + Playwright E2E (page loads, critical actions).

### C) Implement a Periodic Worker Job

1. Define BullMQ queue + processor under `apps/worker` with backoff + concurrency.
2. Add producer in API (if triggered by writes) or scheduler (cron) in worker.
3. Implement business logic; keep transactions short; bulkWrite when possible.
4. Emit events to Redis channels; update caches.
5. Tests: unit (logic), integration (queue flow with fakes/memory DB).
6. Observability: add metrics (processed/sec, failures), set alerts if lag > threshold.

### D) Add/Modify a Mongo Index

1. Add `schema.index(...)` in the model; write a migration script if it’s expensive.
2. Ensure compound keys reflect query patterns; add **partial** or **sparse** when appropriate.
3. Run locally; confirm with `explain()`; ensure CI job for index sync.

### E) Add a Webhook (e.g., M‑Pesa)

1. Create controller under `WebhooksModule`; **verify signature** first; parse payload.
2. Upsert an idempotent `webhook_events` record; short‑circuit replays.
3. Process business logic within a DB transaction; write audit log.
4. Return 2xx quickly; push heavy work to a queue.
5. Tests: replay payloads; signature failure paths; idempotency.

### F) TikTok OAuth & Video Ingestion

1. Add `/tiktok/oauth/start` (generates code\_verifier/challenge) and `/tiktok/oauth/callback`.
2. On callback, **encrypt tokens** using KMS key, store in `tiktok_accounts`.
3. During submissions or periodic sync, call Display API to list videos + metrics; cache in `videos`.
4. Render via **oEmbed** through backend proxy only.

---

## 15) Security, Audit, Rate Limits

* **OAuth tokens:** AES‑256‑GCM at rest; key rotation supported; never log secrets.
* **Webhook sigs:** Verify before processing; reject if invalid; log attempt in `audit_logs`.
* **Idempotency:** Use unique keys and DB unique indexes to enforce.
* **Rate limits:** Sliding window via Redis on donation, OAuth, joins.
* **Audit:** Admin/moderation/payout actions logged with actor and entity.
* **Fraud:** Velocity limits per MSISDN; blacklist abusive actors; detect anomalies in donation amounts.

---

## 16) Observability & Alerting

* **Dashboards:** p95 latency, error rate, queue depths, Mongo connections/locks, Redis hit rate, STK success %.
* **Alerts:** donation failure >3%/5m; leaderboard lag >15m; token refresh errors; Mongo primary step‑down.
* **Tracing:** propagate `x-request-id`; sample \~10% of requests; instrument queues.

---

## 17) CI/CD (GitHub Actions)

**PR pipeline:** type‑check, lint, unit/integration tests, build, **GraphQL schema diff + persisted query validation**, Docker build for api/worker, Vercel preview for web.
**Main:** push images to ECR, Terraform plan/apply (manual approval for prod), Vercel promote.
**DB:** index sync + validator checks; data migrations via Node scripts run in CI job.

**Required checks (block merge):**

* `lint`, `typecheck`, `test`, `build`
* `graphql-schema-diff` (no breaking)
* GraphQL contract tests/persisted query validation green

---

## 18) Infra & Environments

* **FE:** Vercel (Edge + CDN)
* **API/Worker:** AWS ECS Fargate (or EKS), behind ALB + HTTPS (ACM)
* **DB:** MongoDB Atlas (M30+ baseline; enable backup & multi‑region per plan)
* **Cache:** ElastiCache Redis
* **DNS/WAF:** Cloudflare
* **IaC:** Terraform providers (Atlas, AWS, Cloudflare)
* **Secrets:** `.env.local` for dev; AWS/Atlas Secrets Manager in cloud
* **Envs:** `dev`, `staging`, `prod`

---

## 19) Testing Strategy

* **Unit:** Vitest (both FE/BE). Money and ranking formulas must have golden tests.
* **Integration:** Supertest with Nest + Mongoose memory server; queues with fakes.
* **E2E:** Playwright (PWA install, offline donation retry via Background Sync, STK happy path mock).
* **Contract:** GraphQL schema diffing + persisted query checks against generated client.

---

## 20) Launch Readiness Checklist

* TikTok Display API terms OK; no scraping.
* Daraja live creds verified; callbacks whitelisted; TLS configured.
* Atlas sharding/indexes verified under load.
* Load test: 5k RPS read, 500 RPS write; tune pools; Redis cluster plan.
* Backups & PITR enabled; chaos test primary failover.

---

## 21) First Sprint (2 Weeks) — Concrete Deliverables

**Backend:** Nest scaffold + Mongoose; Users/Challenges/Submissions/Donations collections; TikTok OAuth stub; GraphQL resolvers for `featuredChallenges`, `challenge`, `requestStkPush` (sandbox), plus `/webhooks/mpesa/stkpush`; BullMQ wired; leaderboard job returns static Top 3.
**Frontend:** Next.js PWA, Tailwind, shadcn/ui, Workbox SW, Web Push skeleton; pages `/`, `/challenges`, `/c/[slug]`, `/donate/[submissionId]`, `/me`; API client powered by GraphQL documents; React Query + error boundaries.
**Ops:** GitHub Actions CI, Vercel preview, Dockerfiles, Terraform scaffolding (Atlas + AWS).

---

## 22) Coding Standards

* TypeScript **strict**. ESLint/Prettier enforced. No `any` in DTOs/shared types.
* Zod validation on all inputs; sanitize outputs.
* Mongoose schemas colocated with modules; each module exports a documented public API.
* Feature flags via env/DB; no hard‑coded behavior.

---

## 23) Make & Scripts (reference)

**`package.json` (root) provides scripts** used above. Example Makefile:

```makefile
.PHONY: dev lint typecheck test build

dev:
	pnpm -w run dev

lint:
	pnpm -w run lint

typecheck:
	pnpm -w run typecheck

test:
	pnpm -w run test

build:
	pnpm -w run build
```

---

## 24) Agent Operating Protocol (AOP)

**When assigned a task:**

1. Read this file + linked ticket.
2. Identify domain (FE / API / Worker / Infra) and confirm ownership boundaries.
3. Propose a minimal plan in the PR description (bulleted steps).
4. Execute the relevant **Playbook** (§14) and **Checklists** below.
5. Open a Draft PR early; push small commits; keep CI green.

**Pre‑Commit Checklist (every change):**

* [ ] Lint/typecheck/tests pass locally
* [ ] GraphQL schema/artifacts updated (if API changed), FE documents regenerated
* [ ] DB indexes/validators updated & migration included
* [ ] Security reviewed (secrets, PII masking, rate limits)
* [ ] Observability updated (metrics, alerts if needed)
* [ ] Docs updated (README, CHANGELOG, ADR if architectural)

**Pre‑Merge Checklist:**

* [ ] All required CI checks green
* [ ] No breaking GraphQL schema diff
* [ ] PWA installable & offline tolerant (if FE impacted)
* [ ] Load/perf impact considered; caches set/invalidation paths defined

**Post‑Merge Checklist:**

* [ ] Deploy to `staging`; smoke test (health, logs, canary)
* [ ] Verify dashboards/alerts
* [ ] Promote to `prod` per release process

---

## 25) Glossary

* **A:** Amount in cents (KES×100)
* **CreatorShare / CommissionNet / VAT:** Components of donation split
* **Idempotency Key:** Hash(msisdn+submissionId+minute) for STK Push initiation
* **Keyset Pagination:** Pagination via `_id` bounds, not offset/limit

---

## 26) Appendices

### A) Redis Channel Names

* `leaderboard:update:<challengeId>` — payload: `{ challengeId, leaderboardId, top3 }`
* `donation:update:<donationId>` — payload: `{ donationId, status }`

### B) Error Codes (sample)

* `E_OAUTH_EXPIRED`, `E_WEBHOOK_SIG`, `E_RATE_LIMIT`, `E_IDEMPOTENT_REPLAY`, `E_VALIDATION`, `E_MONEY_PRECISION`

### C) API Envelope Example

```json
{
  "data": { "id": "...", "status": "paid" },
  "error": null,
  "meta": { "requestId": "abc-123" }
}
```

### D) Security Headers (API)

* `Helmet` defaults + HSTS; `x-request-id` echo; strict `CORS` with allowlist.

### E) oEmbed Sanitization

* Strip scripts/iframes except TikTok embed allowlist; set `sandbox` attributes where applicable.

---

**This document is source‑of‑truth for TrendPot agents. If reality diverges, update this file in the same PR as the change.**

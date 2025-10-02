# TrendPot Monorepo

This repository is now bootstrapped with a Turborepo workspace that hosts the customer-facing web application, NestJS API, background worker, and shared packages. The long-form product and architecture brief that follows remains unchanged for reference.

## Getting started

```bash
pnpm install
pnpm dev
```

The `pnpm dev` script runs all dev servers declared in the workspace via Turbo. Each package can also be developed individually (see `apps/` and `packages/`).

---

# TrendPot
PWA that ranks top TikTok challenge videos (consenting creators) and powers fan donations via M-Pesa. Stack: Next.js (PWA) • NestJS • MongoDB Atlas • Redis • BullMQ.

App name  - TrendPot 
1) Objective
Build a mobile‑first, installable PWA that ranks the Top 3 videos per TikTok challenge/hashtag from consenting creators, and lets fans donate via M‑Pesa (STK Push). The system must be modular, team‑friendly, and scale to millions of users with clear ownership boundaries.
Compliance: We use TikTok Display API (creator‑consented reads) + TikTok oEmbed for embeds. We do not scrape or rely on unofficial APIs. Donations are processed via Safaricom Daraja (Lipa na M‑Pesa Online / STK Push).

2) Non‑Negotiables
MongoDB is the primary datastore (Atlas, multi‑region, sharded). No Postgres.


PWA: installable, offline‑tolerant, push notifications, mobile‑first + desktop responsive.


Clear team boundaries:


Frontend team owns Next.js app + shared UI lib.


Backend team owns NestJS API, queues/workers, webhooks.


Strict API contract: GraphQL schema-first; FE operations are generated.


Event/queue architecture for sync/refresh/webhooks and leaderboards.


Security: OAuth tokens, webhook signature verification, idempotency, rate limits, audit logs. Configure API CORS allowlists via `ALLOWED_ORIGINS` (comma-separated origins); disallowed origins receive 403 responses and no CORS headers.



3) Technology Choices (Pin these for the project)
Language/runtime
TypeScript (strict), Node.js 20 LTS


Monorepo
Turborepo + pnpm workspaces


Frontend (PWA)
Next.js (App Router, >=14), React 18, TanStack Query, Zustand


Styling: Tailwind CSS + Radix primitives + shadcn/ui


Forms: React Hook Form + Zod


Icons: lucide-react


PWA: Workbox (service worker), Web Push (VAPID), Manifest v3


Backend
NestJS 10 (GraphQL over Fastify via Mercurius), GraphQL schema linting, Helmet, CORS


MongoDB Atlas 7.x (Global Clusters, sharded) with Mongoose 8.x (or Typegoose)


Redis 7 for cache + Pub/Sub


BullMQ for queues/jobs


Integrations
TikTok Display API (creator OAuth; metrics)


TikTok oEmbed (render)


Safaricom Daraja (M‑Pesa): STK Push, optional C2B; later B2C payouts


Auth & Sessions
In-house NestJS auth service with TikTok OpenAuth and signed session cookies handled entirely server-side.


Infra & Ops
FE: Vercel (Edge + CDN)


API & Worker: AWS ECS on Fargate (or EKS), behind ALB + HTTPS (ACM)


DB: MongoDB Atlas (M30+ to start, enable backup & multi‑region later)


Cache: AWS ElastiCache Redis


DNS/WAF: Cloudflare


IaC: Terraform (Atlas, AWS, Cloudflare via providers)


Observability
OpenTelemetry traces; metrics + logs in Grafana/Prometheus/Tempo (or Datadog)


Errors: Sentry


Product analytics: PostHog


CI/CD
GitHub Actions: type‑check, lint, test, build, GraphQL schema diff, Docker build, deploy to Vercel/AWS


Testing
Unit: Vitest; Integration: Supertest (Nest), Mongoose memory server; E2E: Playwright


Contract: GraphQL schema diffing + persisted query validation



4) Repository Layout (Monorepo)
/ (turborepo)
  apps/
    web/                # Next.js PWA (frontend)
    api/                # NestJS service (backend)
    worker/             # BullMQ consumers & schedulers
  packages/
    ui/                 # Shared React UI library (design system)
    types/              # GraphQL documents, TS types + Zod schemas
    config/             # ESLint, tsconfig, tailwind preset
    utils/              # Shared utilities (dates, money, fetch)
  infra/
    terraform/          # AWS + Atlas + Cloudflare IaC
    vercel/             # vercel.json, headers
  .github/workflows/    # CI pipelines

Rules
FE consumes only GraphQL via packages/types client. No cross‑import into API.


All shared UI primitives live in packages/ui.


Feature flags & constants live in packages/utils.



5) MongoDB Data Model (Collections & Indexes)
General principles
Use referencing, not deep embedding, for entities that change independently (users, videos, submissions, donations).


All writes that span multiple collections in a single workflow (e.g., donation + ledger) use transactions (Atlas replica set required). Keep multi‑doc transactions small and short.


Default ID type: ObjectId. Store foreign keys as ObjectId.


Keyset pagination using _id or createdAt (indexed), never offset.


Validation: Mongoose schemas + MongoDB JSON Schema validator per collection.


Collections
users { _id, email, phone, roles[], status, displayName, metadata, audit, createdAt, updatedAt }


Indexes: { email: 1 } unique, { phone: 1 } unique sparse


sessions { _id, userId, rolesSnapshot, issuedAt, expiresAt, refreshTokenHash, ipAddress, userAgent, status, metadata }


Indexes: { refreshTokenHash: 1 } unique, { userId: 1, issuedAt: -1 }, { expiresAt: 1 } TTL


audit_logs { _id, actorId, actorRoles, action, targetId, context, severity, createdAt }


Indexes: { actorId: 1, createdAt: -1 }, { "context.summary": "text" }


tiktok_accounts { _id, userId, openId, accessTokenEnc, refreshTokenEnc, scope, expiresAt, createdAt, updatedAt }


Indexes: { userId: 1 }, { openId: 1 } unique


videos { _id, tiktokVideoId, ownerTikTokAccountId, shareUrl, caption, postedAt, likeCount, viewCount, commentCount, shareCount, lastRefreshedAt }


Indexes: { tiktokVideoId: 1 } unique, { ownerTikTokAccountId: 1, postedAt: -1 }


challenges { _id, slug, name, hashtag, description, rulesMd, startsAt, endsAt, status, createdByUserId, createdAt }


Indexes: { slug: 1 } unique, { status: 1, startsAt: -1 }


submissions { _id, challengeId, userId, videoId, state, reason, createdAt }


Indexes: { challengeId: 1, state: 1, _id: -1 }, { userId: 1, challengeId: 1 }


leaderboards { _id, challengeId, computedAt }


Indexes: { challengeId: 1, computedAt: -1 }


leaderboard_entries { _id, leaderboardId, submissionId, score, rank }


Indexes: { leaderboardId: 1, rank: 1 }, { submissionId: 1 }


donations { _id, submissionId, donorUserId, amountKES, status, mpesaCheckoutRequestId, mpesaReceipt, rawCallbackJson, createdAt }


Indexes: { submissionId: 1, _id: -1 }, { donorUserId: 1, _id: -1 }, { mpesaCheckoutRequestId: 1 } unique


payouts { _id, creatorUserId, amountKES, status, method, createdAt }


Indexes: { creatorUserId: 1, _id: -1 }


webhook_events { _id, source, eventType, payload, receivedAt, processedAt, status }


Indexes: { source: 1, receivedAt: -1 }, optional TTL on processed docs


audit_logs { _id, actorUserId, action, entity, entityId, meta, createdAt }


Indexes: { entity: 1, entityId: 1, createdAt: -1 }, { actorUserId: 1, createdAt: -1 }


rate_limits { _id, key, windowStart, count }


Indexes: { key: 1, windowStart: 1 }


Sharding (Atlas)
Shard submissions, leaderboard_entries, donations by hashed keys aligned with access patterns:


submissions: { challengeId: 'hashed' }


leaderboard_entries: { leaderboardId: 'hashed' }


donations: { submissionId: 'hashed' } (or { creatorUserId: 'hashed' } if payouts/reporting dominate)


Keep small reference collections (challenges, users) unsharded or zone‑sharded when global.


Change Streams (Optional)
Use change streams on donations to trigger real‑time updates → publish to Redis channels consumed by FE.



6) External Integrations (Exact Responsibilities)
TikTok Display API
OAuth (PKCE) endpoints in backend; store tokens encrypted (AES‑256‑GCM) in tiktok_accounts.


Video ingestion: /video/list//video/query during submission + periodic refresh; writes to videos and joins to submissions.


TikTok oEmbed
Backend proxy /embed?url=… fetches oEmbed → sanitize → FE renders <TikTokEmbed/>.


M‑Pesa Daraja (STK Push)
`requestStkPush` mutation triggers /mpesa/stkpush/v1/processrequest.


Webhook /webhooks/mpesa/stkpush verifies signature → upserts donation by mpesaCheckoutRequestId → status transitions with idempotency.



7) API (GraphQL Schema) — Queries & Mutations
All client/server contracts flow through a single GraphQL endpoint (`POST /graphql`).
The SDL is the source of truth, committed in-repo and validated in CI to prevent
breaking changes. Persisted queries (hash → document) back the PWA to guarantee
only reviewed operations hit production.

### Core Queries
| Operation | Shape | Purpose |
| --- | --- | --- |
| `health` | `Health!` | Service uptime + identifier for smoke tests. |
| `me` | `User` | Authenticated user profile, linked TikTok account, donation totals. |
| `featuredChallenges(status, limit)` | `[ChallengeSummary!]!` | Surface active challenges for the home feed (used by PWA hero grid). |
| `challenge(id)` | `Challenge` | Challenge detail including leaderboard preview, submission counts, donation progress. |
| `challengeSubmissions(id, state, after, first)` | `SubmissionConnection!` | Moderator + creator views with keyset pagination. |
| `challengeLeaderboard(id, first, after)` | `LeaderboardConnection!` | Full leaderboard with cursor pagination + node metrics. |
| `creatorVideos(after)` | `VideoConnection!` | TikTok video library for submission flow (server-side TikTok API integration). |
| `donation(id)` | `Donation` | Lookup donation status for post-checkout polling. |
| `creatorDonations(creatorId, after)` | `DonationConnection!` | Creator earnings history. |

### Mutations
| Operation | Purpose |
| --- | --- |
| `startTikTokOAuth(redirectUri)` | Issues TikTok authorization URL and stores CSRF/verifier material. |
| `completeTikTokOAuth(code, state)` | Exchanges code for tokens, encrypts secrets, links TikTok account. |
| `submitToChallenge(challengeId, videoId)` | Creates a submission in `pending` state with audit trail + idempotency. |
| `moderateSubmission(submissionId, decision)` | Moderator workflow to approve/reject with reason logging. |
| `upsertChallenge(input)` | Admin mutation to create/update challenge metadata. |
| `publishChallenge(challengeId)` | Toggles challenge visibility + schedules leaderboard jobs. |
| `requestStkPush(input)` | Initiates M-Pesa donation, enforces amount validation + idempotency keys. |

### Webhooks & Out-of-band Integrations
* TikTok webhooks remain REST (per provider requirements) and feed dedicated
  queues before resolvers surface updates.
* `POST /webhooks/mpesa/stkpush` stays HTTP to satisfy Safaricom callbacks;
  the resolver-backed donation queries consume the resulting state changes.

### Governance
* Schema lives in `apps/api/src/**/*.graphql.ts` via Nest GraphQL code-first
  decorators; `apps/api/schema.gql` is emitted on build for review and for
  persisted query validation.
* `packages/types` bundles typed documents + Zod schemas for each approved
  operation. Add new operations there and re-run the GraphQL generation script
  (`pnpm -w run graphql:gen`) whenever the schema evolves.


Admin/Moderation
`adminReports` query, `flagSubmission` mutation, `adminAuditLog` query


Conventions
GraphQL errors return `extensions.code` (e.g. `E_VALIDATION`, `E_RATE_LIMIT`) and
always propagate `x-request-id` via response headers for tracing.


All inputs validated by Zod DTOs; sanitize outputs.



8) Ranking Service (Deterministic & Explainable)
Score
score = 0.50*(views/hour) + 0.25*(likes/hour) + 0.15*(comments/hour) + 0.10*(shares/hour)
+ recencyBoost (if video < 48h old)

Process
Worker runs every 10 min per live challenge.


Aggregates from videos joined via submissions.


Writes a new leaderboards doc + leaderboard_entries batch (bulkWrite) inside a transaction; emits Redis event leaderboard:update.


Anti‑abuse: cap extreme deltas (p99), flag suspicious entries into admin/reports.



9) Background Jobs & Scheduling (BullMQ)
tokenRefresh: renew expiring TikTok tokens (<24h)


videoSync: pull latest metrics for opted‑in creators in active challenges


leaderboard: compute rankings; cache top3 in Redis (TTL 60s)


donationRecon: reconcile payments daily


dlqHandler: monitor dead‑letter queues



10) Caching & Performance
Redis: cache `challengeLeaderboard` top3 slice for 60s; invalidate on leaderboard compute.


HTTP caching/CDN: s-maxage=60, stale-while-revalidate=120 for public reads.


Mongo: ensure read prefs to nearest region; enable connection pooling with maxPoolSize tuned from load tests.


Pagination: keyset via _id (or createdAt) with { _id: { $lt: lastId } }.



11) PWA: Installability, Offline, Push
Manifest: name, short_name, icons, start_url='/', display='standalone', theme colors.


Service Worker (Workbox):


StaleWhileRevalidate for app shell, CacheFirst for static, NetworkFirst for JSON with small TTL


Background Sync: queue failed `requestStkPush` mutations and retry


Web Push:


VAPID keys; store push subscription in users sub‑doc notifications


Topics: challenge:<id>, donation:<id>; server sends on leaderboard change, donation status, challenge publish


Install UX: custom beforeinstallprompt flow and in‑app banner



12) Frontend — Pages, User Flows & Data Sources (Exact)
Rule: every page declares data source (DB via our API, or external via backend).
Public
/ Home — Featured live challenges


Data: `featuredChallenges(status: "live", limit: 6)` query (API→Mongo)


Actions: open challenge → /c/[slug]


/challenges Explore Challenges — Filters + infinite scroll


Data: `challenges(first, after, filters)` query (API→Mongo)


Actions: click a challenge → /c/[slug]


/c/[slug] Challenge Details — Hero, rules, Top 3 (real‑time), full leaderboard


Data:


`challenge(id)` (API→Mongo)


`challengeLeaderboard(id, first)` (API→Redis/Mongo)


`challengeSubmissions(id, state: approved, after)` (API→Mongo)


Realtime: subscribe to leaderboard:update via SSE/WS


Actions: Join (creators), Donate (fans)


/s/[submissionId] Submission Detail — TikTok embed + metrics + donation widget


Data: `submission(id)` (API→Mongo + oEmbed HTML via API proxy)


Actions: Donate → /donate/[submissionId]


Authenticated
 5. /join Join a Challenge — Creator flow
If TikTok not connected → /connect/tiktok


List my videos (with metrics) → select one → `submitToChallenge` mutation


Data: `creatorVideos(after)` query (API→TikTok Display API→Mongo cache)


/connect/tiktok TikTok Connect — OAuth start/callback


Data: redirects via backend; on success → /me


/me My Profile — Submissions, donations (made/received), TikTok status


Data: `me` + `creatorDonations(creatorId, after)` queries (API→Mongo)


/donate/[submissionId] Donate — Phone + amount → STK Push


Action: `requestStkPush` mutation


Status: poll `donation(id)` query or subscribe to SSE/WS


/notifications Notifications — Manage push topics


Data: `me` query + `updateNotificationPrefs` mutation (API→Mongo)


Admin/Moderation
 10. /admin Dashboard — Metrics tiles
 - Data: `adminSummary` query (API→Mongo + Redis)
/admin/challenges & /admin/challenges/new|:id — CRUD/publish


Data: `upsertChallenge` mutation + `challenge(id)` query (API→Mongo)


/admin/submissions — Review queue


Data: `challengeSubmissions(state: pending, after)` query (API→Mongo)


/admin/donations — Reconciliation


Data: `adminDonations(dateRange)` query (API→Mongo)


/admin/audit — Security log


Data: `adminAuditLog(actor, after)` query (API→Mongo)


Shared UI Library (packages/ui)
Primitives: Button, Input, Select, Modal, Card, Tabs, Toast, Badge, Pagination, EmptyState, Skeleton


Feature components: TikTokEmbed, DonationWidget, ChallengeCard, SubmissionCard, LeaderboardList, MetricChip



13) Frontend Implementation Details
Data layer: React Query for server cache; invalidate on leaderboard:update.


Local state: Zustand (UI only). No server state inside Zustand.


API client: GraphQL documents + Zod validation exported from packages/types.


Error boundaries and skeletons everywhere.


Accessibility: Radix, ARIA roles, keyboard nav.


Responsive: Tailwind breakpoints; components expose variant props to support mobile/desktop differences for separate sub‑teams.


Analytics: PostHog events (donation_started/succeeded, join_started/submitted, etc.).



14) Backend Implementation Details (NestJS + Mongoose)
Modules: AuthModule, UsersModule, TikTokModule, ChallengesModule, SubmissionsModule, LeaderboardsModule, DonationsModule, WebhooksModule, AdminModule.


Providers: MongoProvider (Mongoose connection), RedisProvider, BullProvider (queues), TikTokClient, MpesaClient.


Guards: Platform session guard + RolesGuard (TikTok-issued sessions). Interceptors: RateLimit (Redis-backed for auth/admin), RequestId, Logging.


DTO Validation: Zod schemas; map to GraphQL input types via Nest decorators (code-first).


Transactions: use withTransaction for donation + ledger writes; time out at 5s.


Bulk ops: bulkWrite for leaderboard entry upserts.


Indexes: created in code via schema.index(...) and ensured on boot (admin job in CI for prod).


Security: AES‑256‑GCM token encryption (KMS key from AWS Secrets Manager), signed webhooks, HSTS, strict CORS.



15) M‑Pesa (Daraja) — Exact Steps
Sandbox: app + credentials (ConsumerKey/Secret, ShortCode, Passkey).


Auth: backend obtains Bearer token from Daraja; cache in memory for 40–50 min.


STK Push: POST /mpesa/stkpush/v1/processrequest with required fields (BusinessShortCode, Password=Base64(ShortCode+Passkey+Timestamp), Timestamp, Amount, PartyA, PartyB, PhoneNumber, CallBackURL, AccountReference, TransactionDesc).


Callback: verify, update donations.status = paid|failed, store raw payload, emit donation:update to Redis.


Idempotency: `requestStkPush` accepts an idempotency key (hash of MSISDN+submissionId+minute); dedupe mpesaCheckoutRequestId unique index.


Recon: daily job cross‑checks Daraja statements (if available) or internal logs.



15.1) Monetary Data Types & Rounding Rules (MANDATORY)
Store amounts as integers in kobo/cents: amountCents (KES × 100). No floats anywhere.


Use Decimal library in API/worker (e.g., decimal.js) for arithmetic; convert to cents at boundaries.


Rounding: HALF‑UP to 2dp when converting to KES display; all ledger postings use integer cents.


15.2) Money Flow — Collection → Processing → Distribution
Actors: Donor, Platform (App), Creator, M‑Pesa.
Collection (STK Push)
Donor initiates donation in UI → GraphQL `requestStkPush` mutation.


API creates donations doc with status='pending', generates Posting Batch (see 15.6) in journal_entries with state='prepared' (no effect yet), writes idempotency key (submissionId+msisdn+minute).


STK prompt on device; on success M‑Pesa calls our webhook.


Webhook verifies signature + amount. If match:


Mark donation paid.


Post to ledgers in a Mongo transaction: see 15.6 (double‑entry), update balances atomically.


Emit Redis donation:update + push notification.


Processing
Nightly reconciliation job imports M‑Pesa statements → mpesa_transactions (raw) and matches by mpesaCheckoutRequestId + amount. Unmatched items flagged.


Fees recognized when known (from callback/statement). If fee unknown at time of donation, book to clearing account (see 15.4) and true‑up on recon.


Distribution
Creator wallet balance increases immediately (liability). Payouts executed by:


B2C (automated) or


Manual settlement to bank/M‑Pesa for early phases.


Payout scheduler groups payable balances into payout_batches respecting limits; each payment posts journal entries (15.8).


15.3) Accounting Model (Double‑Entry, Control Accounts)
We maintain a General Ledger (GL) and Sub‑ledgers with strict double‑entry. The sum of all sub‑ledger balances must reconcile to GL control accounts.
GL: chart of accounts, journal entries, trial balance.


Creator Wallet Sub‑ledger: per‑creator running balance; control: Liability:Creators Payable.


Company (Platform) Sub‑ledger: tracks platform revenue and cash; control: Equity/Revenue lines in GL.


15.4) Chart of Accounts (Initial)
Assets
1000 Cash:MpesaPaybill


1100 Clearing:MpesaPending (temp asset until recon)


Liabilities
2000 Liability:CreatorsPayable (Control)


2100 Liability:TaxesPayable:VATOutput


2200 Liability:WithholdingPayable (if applied)


Revenue
4000 Revenue:PlatformCommission


Expenses
5000 Expense:PaymentProcessingFees


5100 Expense:PayoutFees


Equity
3000 Equity:RetainedEarnings (closing entry target)


15.5) Ledger Collections (Mongo)
accounts { _id, code, name, type['asset'|'liability'|'equity'|'revenue'|'expense'], active }


journal_entries { _id, batchId, eventType, eventRefId, lines:[{ accountCode, debitCents, creditCents, meta }], currency:'KES', postedAt, state['prepared'|'posted'|'voided'], createdAt }


wallets { _id, userId, availableCents, pendingCents, updatedAt } (creators only)


wallet_ledger_entries { _id, walletId, journalEntryId, deltaCents, type['credit'|'debit'], reason, createdAt }


company_ledger_entries { _id, journalEntryId, revenueCents, vatCents, cashDeltaCents, createdAt }


payout_batches { _id, createdAt, createdByUserId, status['pending'|'processing'|'paid'|'failed'], totalCount, totalCents }


payout_items { _id, batchId, walletId, msisdn, amountCents, status, mpesaReceipt, attempts, createdAt }


mpesa_transactions { _id, checkoutRequestId, receipt, msisdn, amountCents, feeCents, direction['in'|'out'], raw, postedAt, matchedDonationId }


All posting to GL and sub‑ledgers occurs inside a single Mongo transaction with retry on transient errors.
15.6) Posting Rules per Event (Double‑Entry)
All examples use integer cents; A = gross donation cents.
(A) Donation SUCCESS (at webhook)
Compute distribution (see 15.7). Let:


creatorShare = floor(0.70 * A)


commissionGross = A - creatorShare (== 30%)


VAT rate configured r (e.g., 0.16).


vat = round( commissionGross * r / (1 + r) )


commissionNet = commissionGross - vat


Journal (GL):


Dr 1000 Cash:MpesaPaybill = A


Cr 2000 Liability:CreatorsPayable = creatorShare


Cr 2100 Liability:TaxesPayable:VATOutput = vat


Cr 4000 Revenue:PlatformCommission = commissionNet


Sub‑ledgers:


Creator wallet: credit creatorShare to wallet availableCents and add wallet_ledger_entry linked to the same journalEntryId.


Company ledger: record revenueCents=commissionNet, vatCents=vat, cashDeltaCents=A.


(B) Recognize M‑Pesa COLLECTION FEE (when known)
If fee f is deducted from cash:


Dr 5000 Expense:PaymentProcessingFees = f


Cr 1000 Cash:MpesaPaybill = f


If unknown on donation, initially:


Dr 1100 Clearing:MpesaPending = A


Cr 1000 Cash:MpesaPaybill = A


On recon: move from Clearing to proper accounts + fees (two journals) and close clearing to zero.


(C) Payout to Creator (B2C) with amount P (<= wallet available)
Journal:


Dr 2000 Liability:CreatorsPayable = P


Cr 1000 Cash:MpesaPaybill = P


If payout fee pf charged:


Dr 5100 Expense:PayoutFees = pf


Cr 1000 Cash:MpesaPaybill = pf


Sub‑ledger: creator wallet debit P and reduce availableCents atomically.


(D) Donation REVERSAL/REFUND (rare; if processed)
Reverse the original donation journal using an exact contra (same lines, swap Dr/Cr). Also reverse wallet entry and revenue/VAT. If cash fee is non‑refundable, book expense remains.


(E) Write‑offs / Adjustments require admin approval + audit log; always post via separate adjustment journals.
15.7) Distribution Algorithm (70/30 with VAT on Commission)
Inputs: amountCents A, vatRate r (config), currency KES.
 Outputs: creatorShare, commissionNet, vat.
Algorithm (deterministic; use Decimal):
commissionGross = floor(A * 0.30)
vat            = round( commissionGross * r / (1 + r) )
commissionNet  = commissionGross - vat
creatorShare   = A - commissionGross
assert creatorShare + commissionNet + vat == A

Store all 3 components on the donations document: { creatorShareCents, commissionNetCents, vatCents }.


Persist a journal_entries batch with lines exactly as in 15.6(A).


Expose values to FE via the `donation(id)` query.


15.8) Wallets & Available Balance Rules
On donation success, increase wallet.availableCents by creatorShare.


Holds: optional pendingCents window (e.g., 24h) before moving to availableCents if chargebacks are a concern.


Payout eligibility: KYC complete, min payout threshold met, no account holds.


15.9) Payout Scheduling & Batching
Workers create payout_batches (size/time window limits). Each payout_item maps to one B2C transfer.


On processing: call M‑Pesa B2C; write mpesa_transactions and post journal (15.6C) per item in a transaction.


On failure: mark item failed, rollback wallet change, requeue with exponential backoff.


15.10) Reconciliation & Controls
Daily import M‑Pesa statements → mpesa_transactions; 1:1 match to donations and payout_items by IDs + amounts.

Finance worker runs the `finance:reconcile` queue on an interval (default 12h; override via `FINANCE_RECONCILIATION_INTERVAL_MS`) to compare donation, payout, ledger, and statement sums within the configured lookback window (`FINANCE_RECONCILIATION_LOOKBACK_MS`). Variances beyond `FINANCE_RECONCILIATION_TOLERANCE_CENTS` (default KES 2) trigger structured alerts to `FINANCE_ALERTS_WEBHOOK_URL` for operator action.


Any unmatched entry sits in 1100 Clearing:MpesaPending until resolved.


Trial Balance endpoint computes equality of total debits==credits per day and control reconciliation (sum(wallets.availableCents) == GL balance of CreatorsPayable).


Idempotency: Unique batchId per event; journal_entries has unique index on (eventType,eventRefId).


Locks: Wallet payout uses findOneAndUpdate with $inc and versioning to prevent race conditions.


15.11) Kenyan Tax Considerations (System Support)
VAT on Platform Commission: model supports output VAT on the commission (30% portion). VAT rate r is configurable (env/DB). Journals post VAT to 2100 Liability:TaxesPayable:VATOutput.


Withholding Tax: if creators fall under categories subject to withholding in Kenya, support optional withholdingRate w against commission or payout as per legal advice; journals:


On donation: calculate withholding = round(commissionNet * w) and post:


Dr 4000 Revenue:PlatformCommission = withholding


Cr 2200 Liability:WithholdingPayable = withholding


KRA reporting: store kraPin on users; export monthly VAT/withholding reports (CSV) from GL.


eTIMS/e‑invoicing: generate tax invoice for the commission to the creator if mandated; store invoiceId on donation.


This system is built to comply; finance must configure current rates and finalize mappings with a licensed tax professional.

16) Security & Compliance
OAuth: Tokens encrypted; rotate keys.


PII: phone numbers E.164; mask in logs; access controls enforced.


Rate limits: per IP/user on donation, OAuth, and joins.


Audit: admin actions and payout actions logged to audit_logs.


Fraud: velocity limits per MSISDN; blacklist abusive actors; basic anomaly detection on donation amounts.


OAuth: Tokens encrypted; rotate keys.


PII: phone numbers E.164; mask in logs; access controls enforced.


Rate limits: per IP/user on donation, OAuth, and joins.


Audit: admin actions and payout actions logged to audit_logs.


Fraud: velocity limits per MSISDN; blacklist abusive actors; basic anomaly detection on donation amounts.



17) Dev Workflow & Environments
Branching: trunk‑based w/ short feature branches.


Envs: dev, staging, prod.


Secrets: .env.local for dev; AWS/Atlas Secrets Manager in cloud.


Local dev uses Docker Compose: MongoDB, Redis, mailhog (if needed).


make dev runs web/api/worker concurrently.


Database fixtures: `pnpm -w run db:seed` (see `docs/runbooks/db-seeding.md` for details).



18) CI/CD Pipelines (GitHub Actions)
PR: type‑check, lint, unit/integration tests, build, GraphQL schema diff + persisted query check (fail on breaking), Vercel preview, Docker build of api/worker.


Main: push images to ECR, Terraform plan/apply (manual approval for prod), Vercel promote.


DB Migrations: Mongoose index sync script; validator schema check; data migrations via Node scripts executed in CI job.



19) Observability Playbook
Dashboards: API p95, error rate, queue depths, Mongo connections/locks, Redis hit rate, STK success %.


Alerts: donation failure >3% over 5m; leaderboard job lag >15m; token refresh errors; Mongo primary step‑down.


Tracing: propagate x‑request‑id; sample 10% traces.



20) Launch Readiness Checklist
TikTok Display API terms OK; no scraping.


Daraja live creds verified; callbacks whitelisted; TLS configured.


Atlas sharding enabled where needed; indexes verified under load.


Load test: 5k RPS read, 500 RPS write; tune pools; Redis cluster plan.


Backups & PITR enabled; chaos test primary failover.



21) First Sprint (2 weeks) — Concrete Deliverables
Backend
NestJS scaffold with Mongoose connection; collections & indexes for Users/Challenges/Submissions/Donations


TikTok OAuth stub + /tiktok/videos?mine=true mocked


/challenges, /submissions, /donations/stkpush (sandbox), /webhooks/mpesa/stkpush


BullMQ wired; leaderboard job returns static Top 3


Frontend
Next.js PWA, Tailwind, shadcn/ui, Workbox SW, Web Push skeleton


Pages: /, /challenges, /c/[slug], /donate/[submissionId], /me


API client powered by GraphQL documents; React Query + error boundaries


Ops
GitHub Actions CI, Vercel preview, Dockerfiles, Terraform scaffolding (Atlas + AWS)



22) Coding Standards
TypeScript strict; ESLint/Prettier enforced.


No any in DTOs or shared types; Zod validation on all inputs.


Mongoose schemas colocate with modules; each module exports a documented public API.


Feature flags via env/DB; no hard‑coded behavior.


## TikTok Ingestion Security & QA Checklist
- **Key management:** Encrypted TikTok OAuth tokens must use the `trendpot/tiktok-display-oauth` KMS key. Rotate client and refresh secrets quarterly and verify the key ID stored with each credential matches the active cipher before deployment.
- **Sanitization:** Run `NODE_PATH=./test-shims node --loader ./test-shims/ts-loader.mjs --test packages/types/src/tiktok.sanitization.test.ts` to ensure the embed sanitizer rejects malicious HTML payloads prior to rollout.
- **Worker health:** Execute the integration tests in `apps/worker/src/tiktok/tiktok-jobs.integration.test.ts` to validate metrics refresh flows, Redis publications, and token refresh logic in isolation.
- **Frontend rendering:** Render `apps/web/src/components/challenges/challenge-detail.integration.test.tsx` when validating responsive embeds so regressions in the hero/full-bleed layout are caught early.
- **Runbook:** See `docs/runbooks/tiktok-ingestion.md` for incident response, manual refresh, and provisioning guidance.







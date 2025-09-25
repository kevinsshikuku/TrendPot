# MongoDB Seeding Runbook

This runbook explains how to populate the local or staging MongoDB instance with deterministic fixtures for challenges, creators, and submissions.

## Prerequisites

- Docker Compose stack running MongoDB locally (`docker compose up -d`).
- `apps/api/.env.local` (or `.env.seed`) containing at minimum `MONGODB_URI` and `MONGODB_DB`.
- Dependencies installed via `pnpm install`.

## Command

```bash
pnpm -w run db:seed
```

The root script delegates to `apps/api`'s `seed` task, which executes `apps/api/scripts/seed.ts` through `tsx`.

## What Gets Seeded

- **Challenges**: Three flagship campaigns with realistic funding progress and status fields.
- **Users**: Sample creator profiles plus an admin account for future RBAC testing.
- **Submissions**: TikTok video references mapped to the seeded challenges and creators, including lightweight engagement metrics.

Each record is upserted using unique keys (challenge slug, user email, submission triple of challenge/creator/video). Running the command repeatedly is safe and will update existing fixtures in place.

## Verification

After seeding, connect to Mongo and validate the data:

```bash
mongosh "$MONGODB_URI" --eval 'db.getSiblingDB(process.env.MONGODB_DB || "trendpot").challenges.find({}, { slug: 1, status: 1 })'
```

You should see the three challenge slugs listed with their statuses (`live`, `live`, `draft`).

## Troubleshooting

- Ensure the Mongo container is reachable at the URI declared in the environment file.
- Delete conflicting documents manually if different unique keys already exist in your database.
- Use the `.env.seed` file for seeding-specific overrides without polluting application defaults.

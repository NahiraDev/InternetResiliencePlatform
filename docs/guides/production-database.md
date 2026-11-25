# Production database runbook (issue #411)

Status: the database and schema exist; the items under "Owner actions" still need the owner. Nothing here is
evidence that `/api/v1/ready` is healthy in production until that check has actually passed.

## What exists

- Managed PostgreSQL 17 on Supabase, project `irp-production`, region `eu-central-1`.
- All 8 Prisma migrations applied, and recorded in `_prisma_migrations` with the real file checksums, so
  `prisma migrate deploy` treats the schema as up to date instead of failing with "database is not empty".
- Row level security is enabled on every table. The Supabase API roles (`anon`, `authenticated`) have no
  privileges. IRP never uses the Supabase REST API; it connects directly as a database role.
- Roles: `postgres` is the migrator (owns the tables, runs `prisma migrate deploy`). `irp_runtime` is the
  application role: DML only, no DDL, no access to `_prisma_migrations`, connection limit 20, one allow policy per
  table. `irp_runtime` has **no password yet**, so it cannot log in until the owner sets one.

## Owner actions (secrets never go through chat, issues or CI logs)

1. Set the runtime password in the Supabase SQL editor, typing it yourself:
   `ALTER ROLE irp_runtime PASSWORD '<new random value>';`
2. Build the runtime URL from Supabase "Connect" (pooler host) with user `irp_runtime.<project-ref>`, and add
   `sslmode=verify-full` plus the Supabase root CA (Settings, Database, SSL configuration). Ship the public CA file with
   the API and reference it with `sslrootcert=`.
3. Put the URL in Vercel (Project, Settings, Environment Variables, Production, mark Sensitive) as `DATABASE_URL`, and
   set `IRP_DB_POOL_MAX` (start with 3: every Vercel instance holds its own pool, and the API builds up to two).
   Use the transaction pooler (port 6543). If connections fail with "unsupported startup parameter: statement_timeout",
   set `IRP_DB_STATEMENT_TIMEOUT_MS=0` and run `ALTER ROLE irp_runtime SET statement_timeout = '15s';` instead.
4. Migrations: run `prisma migrate deploy` with the `postgres` role's direct or session-pooler URL from a trusted
   machine, never with the runtime role.
5. Redeploy and confirm `GET /api/v1/ready` returns 200 with `database: healthy`.

## Adding a table later

New tables must get `ENABLE ROW LEVEL SECURITY` and a policy for `irp_runtime` in the same migration:

```sql
ALTER TABLE "NewTable" ENABLE ROW LEVEL SECURITY;
CREATE POLICY irp_runtime_all ON "NewTable" FOR ALL TO irp_runtime USING (true) WITH CHECK (true);
```

Without the policy the runtime role cannot read the table; without RLS the table is exposed to the Supabase API
roles' default grants. Check Supabase's security advisor after every migration.

## Connection limits and saturation

Pools never wait forever: `connectionTimeoutMs` defaults to 5 s and statements to 15 s for both database clients.
`apps/api/src/db-saturation.integration.test.ts` proves that with every connection busy `/api/v1/ready` and login
answer 503 within seconds and recover once connections free up, and that the history/intents/notifications client
times out instead of queueing. It does not measure real Vercel concurrency; run a load test against a preview
deployment before launch and alert on database unavailability and connection saturation.

## Backup and restore rehearsal

Supabase's free plan has no scheduled backups. Do not call #411 done on it: upgrade, or run
`scripts/ops/db-restore-rehearsal.sh` on a schedule from a trusted machine.

```bash
SOURCE_DATABASE_URL=...   # production, read-only role
TARGET_DATABASE_URL=...   # EMPTY isolated database, never production
scripts/ops/db-restore-rehearsal.sh
```

It dumps, restores into the empty target (recreating the source's extensions first), compares every table's row
count and the migration history, and prints a JSON summary with timings. Keep that output as the evidence.
Rehearsal verified locally against PostgreSQL 16 (33 tables, 52 rows); it has not yet run against Supabase.

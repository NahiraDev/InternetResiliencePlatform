# Evidence report — issue #274 Phase 2: Intent Persistence & Durability

Parent tracker: #272. Baseline: Phase 78 on `main`.

## Objective

Make intent durable across process restarts and provide a canonical store interface for production deployments.

## Scope (bounded, no new authorities)

- `packages/resilience-runtime/src/intent/postgres-store.ts` (new) — `PostgresIntentStore` implementing `IntentStore` interface
- `packages/resilience-runtime/src/intent/index.ts` — export `PostgresIntentStore`, `PostgresConfig`
- `packages/resilience-runtime/src/canonical-runtime-composition.ts` — add `createPostgresIntentStore()` factory, `createCanonicalRuntimeWithPostgres()` async constructor
- `packages/resilience-runtime/tests/postgres-store-274.test.ts` (new) — 11 tests covering schema init, upsert, get, getActive, delete, lifecycle filtering
- `packages/resilience-runtime/src/intent/index.ts` — export new types

Non-goals: no schema migration tooling (handled by application), no etcd/Consul backend (can be added later), no CI workflow changes.

## Implementation

### PostgresIntentStore

- Implements `IntentStore` interface: `get`, `getActive`, `put`, `delete`
- Schema: `intents` table with all `CompiledIntent` fields + lifecycle timestamps
- Migration SQL runs on `initialize()` — creates table + indexes on `effective_from`, `expires_at`, `priority`
- Upsert logic: inserts new or updates existing with incremented version
- `getActive(at?)` filters by lifecycle window (`effective_from <= at < expires_at`)
- Dynamic `pg` import — optional dependency, only loaded when store is used
- Graceful handling of missing `pg` (test mock provides Pool)

### Canonical Composition Integration

- `createPostgresIntentStore()` reads env vars:
  - `IRP_INTENT_DB_HOST` (required)
  - `IRP_INTENT_DB_PORT` (default 5432, validated 1–65535)
  - `IRP_INTENT_DB_NAME` (default `irp`, required non-empty)
  - `IRP_INTENT_DB_USER` (default `irp`, required non-empty)
  - `IRP_INTENT_DB_PASSWORD` (optional; empty allowed for trust auth)
  - `IRP_INTENT_DB_SSL` (optional, default false)
  - `IRP_INTENT_DB_MAX` (default 10, validated >= 1)
  - invalid settings throw before the driver is loaded.
- `createCanonicalRuntimeWithPostgres()` — async constructor that auto-creates store from env
- `createCanonicalRuntime` remains synchronous for backward compatibility
- Daemon/CLI continue to work with synchronous `createCanonicalRuntime`

### Lifecycle & Versioning

- `createNetworkIntent` creates draft intent → `transitionIntent(intent, {type: 'activate'})` → active
- `compileNetworkIntent` validates effective window (`effectiveFrom`/`expiresAt`)
- `InMemoryIntentStore` and `PostgresIntentStore` both filter by effective window in `getActive`
- Version increments on every upsert (optimistic concurrency)

## Tests (11 new, all pass)

| Test                                                   | Coverage                          |
| ------------------------------------------------------ | --------------------------------- |
| initializes schema on startup                          | Migration SQL execution           |
| upserts intent with correct fields                     | UPSERT SQL + parameter binding    |
| returns intent by id                                   | Row mapping + field validation    |
| returns undefined for missing intent                   | Empty result handling             |
| returns active intents within time window              | Time-window filtering             |
| deletes intent by id                                   | DELETE execution                  |
| closes pool on close                                   | Pool cleanup                      |
| filters by effective lifecycle window                  | Expired intent excluded           |
| upserts intent with correct fields (active)            | Transition to active + compile    |
| filters by effective lifecycle window (active+expired) | Dual mock with time-window filter |

## CI/runtime evidence

- `pnpm --filter @irp/resilience-runtime build|lint|typecheck|test` — PASS (33 test files, 262 tests)
- `pnpm run validate` — PASS (750 files)
- `pnpm run validate:docs` — PASS (147 files)
- `pnpm run architecture:check` — PASS
- `pnpm run audit:deep` — PASS (0 findings)
- `node scripts/integration-graph.mjs` — PASS (43 components, 93 edges)
- `node scripts/full-system-assurance.mjs` — PASS (222 phases, 335 source files, 0 gaps)

## Known limitations

- No schema migration versioning tool (e.g., Flyway/Liquibase) — schema changes require manual SQL
- No etcd/Consul backend — only PostgreSQL implemented
- No connection pooling tuning beyond `max` config
- No intent store metrics/telemetry integration yet
- `pg` is optional — no static import (type-only); loaded dynamically in
  `initialize()` only, with settings validated first.
- Arbitration conflicts are journaled durably: `RuntimePolicyArbitrator`
  calls `IntentStore.recordConflicts`; `InMemoryIntentStore` keeps a journal and
  `PostgresIntentStore` writes `intent_conflicts` (migration 002).

## Potential follow-up

- Add schema migration versioning (e.g., `migrations/` directory + runner)
- Implement `EtcdIntentStore` / `ConsulIntentStore` for Kubernetes-native deployments
- Add telemetry metrics for store operations (latency, errors, pool saturation)
- Add `IntentStore` metrics to `ResilientTelemetrySink`
- Add database-level advisory locks for distributed coordination

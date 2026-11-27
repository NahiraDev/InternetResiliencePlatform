# API state durability inventory (issue #410)

Status: implemented in source; real-PostgreSQL evidence runs in CI (`IRP_TEST_DATABASE_URL`).

Rule: in `production` or `staging` no API surface may serve state from process memory. Each surface either uses
PostgreSQL or calls `requireDurableOrDevelopment` (`apps/api/src/durability.ts`), which throws
`DurableStoreRequiredError`. Outside production, memory stores are allowed and `resolveDurableStores` logs a
NON-DURABLE warning.

## Durable (PostgreSQL, one shared pool, `IRP_DB_POOL_MAX`)

| State | Store | Evidence |
| --- | --- | --- |
| users, sessions, refresh/reset/verification tokens, audit | `identity/postgres.ts` | `identity-postgres.integration.test.ts` |
| device credentials, refresh tokens, enrollment requests, remote audit | `remote-client-store.ts` | `durable-state-postgres.integration.test.ts` |
| organizations, projects, workspaces, memberships and roles | `identity/postgres.ts` | `tenancy-postgres.integration.test.ts` |
| platform settings (zero-cost mode) | `PlatformSetting` via `durability.ts` | `durable-state-postgres.integration.test.ts` |
| incidents and notifications | `notifications.ts` | `durable-state-postgres.integration.test.ts` |

## Guarded (memory only outside production; production without a durable store fails closed)

History, intents, unified product context rate limiter and notifications refuse to register in production without
their durable store. Probe federation routes return 503 `DURABLE_STORE_UNAVAILABLE` in production until a durable
federation store is injected.

## In-memory on purpose

- Event bus: in-process fan-out of runtime events inside one instance. It is not a source of truth and carries no
  state that must survive a restart.
- Network monitor measurements: ephemeral probe samples, rebuilt on start.
- API simulation runtime decisions and incidents: simulation output, never production authority.

`ResilienceRuntime` stays the only mutation authority; none of these stores is a second control plane.

## Known follow-ups

- No retention job yet for `RemoteClientAuditEvent`.
- The Prisma migration drift check runs in CI only.

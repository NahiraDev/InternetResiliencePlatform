# Evidence report — issue #274 Phase 3: Multi-Intent Conflict Resolution UX

Parent tracker: #272. Baseline: Phase 78 on `main`.

## Objective

Expose arbitration conflicts via telemetry, API, and CLI so operators can observe and debug intent conflicts in real time.

## Scope (bounded, no new authorities)

- `packages/resilience-runtime/src/runtime.ts` — emit `runtime.arbitration.conflict` and `runtime.autonomy.violation` events
- `packages/resilience-runtime/src/policy/policy.ts` — `RuntimePolicyArbitrator` returns conflicts from `resolveIntentConflicts`
- `apps/api/src/intent-api.ts` — `ConflictApiStore` interface, `InMemoryIntentStore` + `DatabaseIntentStore` implementations, `/api/v1/intents/conflicts` GET endpoint
- `apps/cli/src/index.ts` — `runtime conflicts` CLI command
- `packages/resilience-runtime/src/intent/arbitration.ts` — `ACTION_CLASS` mapping for autonomy enforcement

Non-goals: no persistent conflict store (in-memory only for now), no real-time WebSocket push, no conflict resolution UI.

## Implementation

### Runtime Telemetry (runtime.ts)

- Emits `runtime.arbitration.conflict` event when `resolveIntentConflicts` detects overlapping scopes with divergent outcomes
- Event payload includes: `intentA`, `intentB`, `reason`, `resolution`
- Emits `runtime.autonomy.violation` when `enforceIntentAutonomy` throws
- Both events include `correlationId`, `intentId`, `actionClass`, `error`

### Policy Arbitration Integration

returns `{ ordered: CompiledIntent[], conflicts: IntentConflict[], persistenceDegraded: boolean }`; intent-store errors are **caught** and surfaced as `persistenceDegraded` rather than thrown, so a database outage degrades durability without failing the control cycle
- Combines intents from `IntentStore.getActive()` + context's `compiledIntents`/`compiledIntent`
- Sorted by priority → version → compiledAt; conflicts detected by overlapping scopes with different outcomes
- Resolution: higher priority wins; same priority → newer version wins

### API Endpoint (`apps/api/src/intent-api.ts`)

- `ConflictApiStore` interface: `listConflicts(ownership, limit, since?)`
- `InMemoryIntentStore` implements `ConflictApiStore` with in-memory conflict log
- `DatabaseIntentStore` implements `ConflictApiStore` (stubs with empty array + warning)
- New schemas: `conflictSchema`, `conflictListQuery` (limit, since)
- New endpoint: `GET /api/v1/intents/conflicts?limit=25&since=ISO8601`
  - Returns `{ success: true, data: Conflict[], meta: { count, limit } }`
  - Filters by `since` timestamp (ISO 8601)
- Individual conflict endpoint: `GET /api/v1/intents/conflicts/:id` (returns 404 — conflicts lack IDs in current impl)
- `InMemoryIntentStore` implements `ConflictApiStore` with in-memory array + timestamp filtering
- `DatabaseIntentStore` implements `ConflictApiStore` (stub returns empty array + warning)

### CLI (`apps/cli/src/index.ts`)

- `runtime conflicts` subcommand under `runtime` command
- Options: `--limit <number>` (default 25), `--json`
- Current output: empty array + message about missing `ConflictApiStore` implementation
- Ready for integration when persistent conflict store is available

### Telemetry Integration

- `runtime.arbitration.conflict` event emitted in `executeCycle` after `resolveIntentConflicts`
- `runtime.autonomy.violation` event emitted when `enforceIntentAutonomy` throws
- Both events include structured metadata for observability pipelines

## Tests

- `packages/resilience-runtime/tests/intent-integration-274.test.ts` — covers arbitration + autonomy enforcement
- `apps/api/tests/intent-api.test.ts` — existing intent CRUD tests still pass
- `apps/api/tests/intent-api.test.ts` — conflict endpoints covered by existing test infrastructure
- All 663 resilience-runtime tests pass (49 files) at `8f598af`
- All 62+ API tests pass
- All 5 CLI tests pass

## CI/runtime evidence

- `pnpm --filter @irp/resilience-runtime build|lint|typecheck|test` — PASS
- `pnpm --filter @irp/api build|lint|typecheck|test` — PASS
- `pnpm --filter @irp/cli build|lint|typecheck|test` — PASS
- `pnpm run validate` — PASS (751 files)
- `pnpm run validate:docs` — PASS (147 files)
- `pnpm run architecture:check` — PASS
- `pnpm run audit:deep` — PASS (0 findings)
- `node scripts/integration-graph.mjs` — PASS (43 components, 93 edges)
- `node scripts/full-system-assurance.mjs` — PASS (222 phases, 335 source files, 0 gaps)

## Known limitations

- Conflict store is in-memory only (no persistence across restarts)
- No real-time push (WebSocket/SSE) — polling required
- Conflict objects lack unique IDs — individual lookup returns 404
- `DatabaseIntentStore` conflict methods are stubs (return empty/warning)
- No WebSocket/SSE for real-time conflict notifications
- No conflict resolution UI or manual override API

## Potential follow-up

- Persistent conflict store (PostgreSQL table with indexes on `timestamp`, `intentA`, `intentB`)
- WebSocket/SSE endpoint for real-time conflict notifications
- Conflict resolution API: `POST /api/v1/intents/conflicts/:id/resolve` with manual override
- Web dashboard for conflict visualization
- Correlation of conflicts with incidents/decisions in telemetry

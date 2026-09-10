# Phase 80 — Intent API & Ingestion

## Objective
Expose the Phase 79 `NetworkIntent` contract through a bounded, authenticated HTTP ingestion boundary without introducing persistence, translation, policy evaluation, or network mutation.

## Dependencies
- Phase 79 — Intent Model & Lifecycle (merged on `main`)
- Existing Fastify API and JWT/RBAC boundary
- Existing `@irp/core` intent lifecycle functions

## Scope
- Add authenticated intent creation, retrieval and listing endpoints.
- Add lifecycle command ingestion through the existing Phase 79 transition function.
- Validate request shape, timestamps, bounded collection sizes and primitive constraint values.
- Require `Idempotency-Key` for intent creation and reject key reuse with a different payload.
- Preserve immutable intent snapshots and monotonic lifecycle versioning from Phase 79.
- Register the routes from the canonical API entrypoint.
- Add focused API tests for creation, replay, conflict, validation, retrieval and lifecycle transitions.

## API contract

### `POST /api/v1/intents`
Creates a `draft` intent. Requires `runtime.execute` and `Idempotency-Key`.

Request fields:
- `id`: 1–128 characters
- `priority`: `low | normal | high | critical` (default `normal`)
- `spec.outcome`: 1–2000 characters
- `spec.constraints`: optional bounded record of string/finite-number/boolean values
- `spec.target`: optional record of bounded strings
- `effectiveFrom`, `expiresAt`: optional ISO-8601 timestamps with offsets
- `metadata`: optional record of bounded strings

A repeated idempotency key with the same canonical request returns the original intent. Reuse with a different request returns HTTP 409.

### `GET /api/v1/intents`
Lists bounded intent snapshots. Requires `runtime.inspect`. Optional `status` filter and `limit` 1–100.

### `GET /api/v1/intents/:id`
Returns one intent or HTTP 404. Requires `runtime.inspect`.

### `POST /api/v1/intents/:id/commands`
Applies one Phase 79 lifecycle command through `transitionIntent`. Requires `runtime.execute`. Invalid lifecycle transitions are surfaced as HTTP 409 rather than bypassing the domain contract.

## Storage boundary
The default implementation uses an in-memory store. This is deliberate: Phase 80 defines the API/ingestion boundary only. Durable persistence, event sourcing, distributed idempotency and multi-instance consistency are not silently claimed and belong to later architecture work.

## Safety and security invariants
- All routes require authentication/authorization through the existing API JWT/RBAC boundary.
- Intent creation requires an idempotency key.
- Request schemas are strict; unknown fields are rejected.
- Input collections and strings are bounded.
- API code never executes network actions from an intent.
- Lifecycle validity remains owned by `@irp/core`; the API cannot invent transitions.
- No secrets, credentials or raw network commands are accepted as intent fields.

## Non-goals
- Persistent intent storage.
- Intent translation/compilation.
- Policy decision or enforcement.
- Conflict resolution between intents.
- Scheduling or expiry workers.
- Network/provider mutation.
- Distributed idempotency coordination.

## Verification
Required repository gates remain `pnpm validate`, `pnpm typecheck`, `pnpm lint`, relevant tests and builds, followed by green GitHub Actions. Phase completion is not claimed from source presence alone.

## Rollback
Remove the Phase 80 API module and its registration from the API entrypoint. Phase 79's core intent model remains independently usable.

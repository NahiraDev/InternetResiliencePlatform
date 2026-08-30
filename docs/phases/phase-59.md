# Phase 59 — Notifications & Incident Center

## Status

**Implementation started; verification required.**

## Objective

Provide a server-authoritative incident and notification center for degradation, failure, recovery and actionable diagnostic events. Phase 59 builds on the real network measurements introduced in Phase 58 and keeps notification handling separate from safety-critical routing decisions.

## Scope

- canonical incident lifecycle: `open` → `acknowledged` → `resolved`;
- deterministic incident fingerprinting and repeated-occurrence aggregation;
- severity classification for informational, warning and critical incidents;
- actionable in-product notifications linked to incidents;
- persistent PostgreSQL storage with a migration and Prisma schema contract;
- read/unread notification state;
- authenticated API endpoints for incident inspection and operator acknowledgement/resolution;
- controlled incident-event ingestion boundary for runtime/event adapters;
- evidence, correlation reason, affected components and confidence retained with the incident;
- no network mutation, routing change, DNS change, tunnel action or gateway action from the notification layer.

## API surface started in this phase

- `GET /api/v1/incidents`
- `GET /api/v1/incidents/:id`
- `POST /api/v1/incidents/:id/acknowledge`
- `POST /api/v1/incidents/:id/resolve`
- `GET /api/v1/notifications`
- `POST /api/v1/notifications/:id/read`
- `POST /api/v1/incidents/events`

All endpoints are behind existing API authentication/RBAC primitives. Read operations use `runtime.read`; incident state mutations and ingestion use `runtime.admin`.

## Safety and reliability invariants

1. Incidents are evidence-backed; the service does not fabricate network state.
2. Repeated observations with the same deterministic fingerprint update one logical incident instead of creating an alert storm.
3. Resolution followed by a later matching observation reopens the same incident identity and increments occurrence count.
4. Security and policy failures are escalated to critical severity.
5. Notification handling is advisory/operational and has no execution authority.
6. Production persistence uses PostgreSQL; tests use the in-memory adapter without changing production semantics.
7. SQL values remain parameterized through the existing database client; identifiers are validated UUIDs by the database boundary.

## Verification gate

Phase 59 is not complete until `pnpm validate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, database migration validation and required CI/runtime checks pass on the final Phase 59 commit.

## Remaining implementation work

- connect the runtime event sink to the incident ingestion boundary without coupling notification policy to routing/execution code;
- publish notification/incident capabilities in the unified product capability manifest;
- add Web Control Center incident/notification views consuming these contracts;
- add delivery-channel adapters only where explicitly supported, with bounded retries and auditability;
- add full API integration tests against the authenticated Fastify server and database-backed repository;
- complete production CI/runtime verification before marking the phase complete.

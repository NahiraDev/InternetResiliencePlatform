# Architecture

The authoritative architecture description is [`current-architecture.md`](current-architecture.md).

This file remains as the stable entry point for links that historically referenced `docs/architecture.md`.

## Current implementation

- pnpm/Turbo monorepo targeting the repository's current Node.js runtime contract.
- `apps/api` provides the Fastify control plane, authentication/RBAC boundary, network health and measurement endpoints, runtime/autopilot routes, diagnostics and observability.
- `@irp/auth` provides JWT/RBAC plus the Phase 39 remote-client security primitives.
- `@irp/network`, endpoint intelligence and historical analysis provide bounded network measurement and analysis.
- `@irp/resilience-runtime` owns the observe/decide/policy/apply/verify/recovery runtime contract.
- `@irp/metrics` and `@irp/telemetry` provide internal metrics, Prometheus exposition and OpenTelemetry integration.
- PostgreSQL/Prisma is the persistence boundary; in-memory API stores are not documented as production persistence.
- Docker production runtime is non-root and retains the explicit writable-path/tmpfs contract introduced by the runtime hardening phases.

See [`current-architecture.md`](current-architecture.md) for boundaries, non-goals and the Phase 39 integration status.

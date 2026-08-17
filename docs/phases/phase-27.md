# Phase 27 Integration and Production Readiness Report

## Repository architecture audit

The current repository is a pnpm monorepo with `apps/*` and `packages/*` workspaces. The canonical runtime control-loop implementation is `@irp/resilience-runtime`; API, CLI, daemon, and desktop clients consume workspace packages rather than reimplementing runtime contracts. Existing applications, packages, Docker services, CI workflows, migrations, tests, and documentation were preserved.

## Phase 26 integration

Phase 26 Network Autopilot remains the canonical governed closed-loop architecture for observation, measurement, detection, diagnosis, policy evaluation, action planning, execution, verification, rollback, recovery, circuit breaking, action budgets, idempotency, audit events, dry run, shadow mode, and autonomy modes. Phase 27 keeps the API and CLI aligned with those contracts and documents remaining compatibility boundaries instead of deleting legacy surfaces.

## Docker hardening

The production image keeps the API process non-root as user `irp` and avoids runtime Corepack bootstrap into an unwritable `/app/.cache/node/corepack/v1` path by preparing pnpm during build and copying the prepared pnpm home from the build base image and invoking that pinned pnpm at runtime. Explicit writable paths are `/app/.cache/node/corepack`, `/app/.local/share/pnpm`, and `/app/tmp`, all owned by UID/GID `1001:1001` for the non-root runtime user.

Startup now waits for real database readiness before migrations and API boot. Compose health checks continue to use the API readiness endpoint, and the Docker smoke script validates compose configuration, build, readiness, API health, metrics, non-root execution, and absence of Corepack EACCES logs before clean shutdown.

## Health model

The shared health contract now supports `healthy`, `degraded`, `unhealthy`, `unknown`, `starting`, and `draining`. The telemetry health aggregator preserves degraded/unhealthy precedence while representing startup, draining, and unknown dependency states explicitly.

## Validation and security notes

No unrestricted command execution interface was introduced. No packages, migrations, routes, Docker services, tests, or CI workflows were deleted. Local validation was run with pnpm; Node 20 emitted an engine warning because this repository requires Node 22, so Node-version-sensitive CI remains the authoritative environment for full parity.

## Future cleanup candidates

- Persist Autopilot run state beyond in-memory API runtime for multi-replica crash recovery.
- Replace remaining compatibility/demo status fields that say observe-only or unavailable once host enforcement adapters are production-approved.
- Add authenticated Docker smoke steps for a safe simulated Autopilot operation once a non-secret test credential flow is standardized for compose.
- Expand database integration tests to exercise migration recovery under transient PostgreSQL restarts.

## Phase 28 recommendations

- Add persistent Autopilot run stores and lease-based worker ownership.
- Add CI jobs that run the Docker smoke script against a fresh compose project.
- Add API client contract generation for CLI and Electron consumers.
- Add bounded retry policy helpers for all external HTTP/DNS/database paths.

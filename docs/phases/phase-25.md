# Phase 25 — Production Container Runtime

## Objective

Phase 25 makes the existing Internet Resilience Platform API and resilience runtime buildable, testable, and runnable through a coherent Docker architecture. The phase does not add unsafe host mutation; runtime control remains authenticated, observe-first, and live-mode disabled by default.

## Deliverables

- Production Docker image for the API runtime using pnpm, Turbo workspace builds, Prisma schema validation, and migration deployment.
- Development Compose workflow with the API and PostgreSQL.
- Production-equivalent Compose workflow with health-gated PostgreSQL and API readiness checks.
- Database migration execution through Prisma Migrate, never `prisma db push`.
- Runtime health, readiness, metrics, and Phase 23/25 resilience-runtime API packaging in containers.
- Docker validation in CI.
- Operator documentation for Docker development, production, database operations, and troubleshooting.

## Acceptance Criteria

- `pnpm install`, `pnpm lint`, `pnpm test`, and `pnpm build` pass.
- `docker compose config` and `docker build .` pass.
- Compose starts PostgreSQL and the API, PostgreSQL becomes healthy, `/api/v1/ready` is healthy, and runtime endpoints are packaged in the API container.
- The production image runs as a non-root user, uses a deterministic command, validates Prisma schema, and does not bake secrets.

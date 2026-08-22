# Deployment

Deployment documentation describes the production lifecycle rather than a phase-specific implementation.

## Deployment concerns

- application build and artifact provenance;
- configuration and secret injection;
- PostgreSQL availability and migrations;
- container startup and health checks;
- non-root runtime permissions;
- readiness and liveness behavior;
- telemetry and log collection;
- rollback and recovery.

## Pre-deployment gates

Run the repository validation, typecheck, lint, test, build, and applicable runtime/container/security checks before treating a deployment as production-ready.

## Database

Database schema changes must be applied through the repository's supported Prisma migration workflow. Production deployments must not rely on ad-hoc schema mutation.

## Rollback

Application rollback and database rollback are separate concerns. Do not assume a binary rollback is safe when a schema migration is not backward compatible.

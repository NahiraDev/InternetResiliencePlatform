# Phase 5 Core Backend Architecture

Phase 5 extends the Phase 4 runtime with a clean backend foundation:

- API layer: Fastify routes, OpenAPI registration, validation, error mapping, request correlation, and telemetry hooks.
- Auth layer: password hashing, signed JWT access and refresh tokens, bearer-token authentication, RBAC authorization, and session revocation.
- Domain modules: users, organizations, projects, workspaces, memberships, roles, and permissions.
- Persistence design: Prisma schema with UUID identifiers, indexes, uniqueness constraints, foreign keys, timestamps, token/session tables, audit logs, outbox events, cache entries, and soft deletes.
- Integration services: in-memory queue/event implementations for local execution, readiness hooks for database and queue state, and Prometheus metrics rendering.

Phase 6 should replace in-memory repositories with generated Prisma repositories, add mail delivery, and add multi-tenant membership role assignment workflows.

# ADR-0002: Phase 4 Core Platform Foundation

## Status

Accepted

## Context

The platform needs a scalable foundation before provider-specific DNS and VPN implementation begins.

## Decision

Adopt a modular pnpm monorepo, Fastify API, Prisma/PostgreSQL persistence, typed configuration, Pino logging, Prometheus metrics, OpenTelemetry bootstrap, and explicit auth/events/queue abstractions.

## Consequences

Provider implementations can be added behind stable interfaces in Phase 5 without changing API composition, operational health endpoints, or persistence conventions.

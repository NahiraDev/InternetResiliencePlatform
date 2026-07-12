# Phase 4 Core Architecture

Phase 4 establishes a modular TypeScript monorepo with Fastify at the edge and packages for platform capabilities. The backend follows hexagonal architecture: HTTP adapters call service/use-case code, persistence is hidden behind repository interfaces, and integrations are represented by abstractions until provider implementations are introduced.

## Modules

- `apps/api`: versioned REST API mounted under `/api/v1` with OpenAPI and Swagger UI.
- `apps/dashboard`: dashboard application boundary.
- `apps/cli`: command-line application boundary.
- `packages/core`: dependency injection, lifecycle, errors, and HTTP error mapping.
- `packages/config`: typed multi-environment configuration loaded from YAML and environment variables.
- `packages/logger`: Pino structured logger with development pretty output.
- `packages/telemetry`: Prometheus metrics, request timing primitives, health aggregation, and OpenTelemetry bootstrap hook.
- `packages/database`: Prisma client and PostgreSQL health checks.
- `packages/auth`: authentication and authorization interfaces for future JWT and OAuth providers.
- `packages/events`: typed in-memory publish/subscribe event bus.
- `packages/queue`: queue abstraction with a memory implementation.
- `packages/sdk`: TypeScript API client.
- `packages/shared`: shared DDD primitives.

## Operational Endpoints

- `GET /api/v1/version`
- `GET /api/v1/health`
- `GET /api/v1/ready`
- `GET /api/v1/live`
- `GET /api/v1/metrics`
- `GET /docs`

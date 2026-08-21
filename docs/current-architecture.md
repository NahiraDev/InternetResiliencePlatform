# Current Architecture

**Status:** authoritative for `main` at Phase 39.

## System boundary

InternetResiliencePlatform is a modular TypeScript monorepo with a Fastify API, shared domain/runtime packages, PostgreSQL integration, Dockerized production runtime, and OpenTelemetry/Prometheus observability.

```text
Clients / operators
        |
        v
   Fastify API
        |
  +-----+-------------------------------+
  |     |        |          |            |
 Auth  RBAC   Runtime   Autopilot    Diagnostics
  |     |        |          |            |
  +-----+--------+----------+------------+
                    |
             shared domain packages
                    |
       +------------+-------------+
       |            |             |
    Network      Telemetry     Database
    intelligence  + metrics    PostgreSQL
       |
  endpoint / historical analysis
```

## Current implemented layers

### API

`apps/api` owns HTTP transport, request correlation, authentication/authorization boundaries, health/readiness endpoints, runtime/autopilot control-plane routes, network measurement routes, and operational diagnostics.

The API deliberately keeps network mutation behind explicit runtime/autopilot policy and verification controls. Current status endpoints may report observe-only or partial capabilities; those states must not be documented as active host enforcement.

### Authentication and authorization

`@irp/auth` provides JWT authentication, RBAC authorization, password hashing, and the Phase 39 remote-client security primitives.

Phase 39 primitives include:

- opaque per-device credentials;
- keyed digests and constant-time comparison;
- device/session revocation;
- one-time rotating refresh-token storage;
- bounded remote-client scopes;
- bounded security-audit storage with recursive secret redaction.

The primitives are transport-independent. API route integration remains a required Phase 39 completion gate.

### Network intelligence

The network layer performs bounded measurements and derives health/reliability signals. Endpoint intelligence and historical analysis are read/measurement layers; they do not themselves mutate network state.

### Runtime and autopilot

`@irp/resilience-runtime` implements the closed-loop runtime contract:

`Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check → Apply → Verify → Rollback/Recovery → Telemetry/Logging`

Production mutation remains fail-closed and policy-gated. Simulation/observe-only modes are not equivalent to live host enforcement.

### Observability

`@irp/telemetry` and `@irp/metrics` provide bounded metrics, diagnostics, Prometheus exposition and OpenTelemetry integration. Logs and telemetry must not contain bearer credentials, refresh tokens, device secrets or equivalent secret material.

### Persistence

PostgreSQL/Prisma is the persistence boundary. In-memory stores still present in API code are application-local runtime/test stores and must not be documented as the production persistence model.

### Deployment

The production API runs as a non-root container. Runtime writable paths are explicitly constrained through the existing Docker/Compose contract; the Corepack/pnpm cache permission regression is covered by the runtime smoke path.

## Non-goals currently

The following must not be described as implemented production capabilities unless the code and verification gates are subsequently changed:

- unrestricted network scanning;
- automatic censorship/access-control bypass;
- active host routing mutation from the observation endpoints;
- production-grade VPN/tunnel enforcement merely because tunnel abstractions exist;
- a completed Android/iOS UI;
- a fully integrated remote-device authentication flow before Phase 39 integration is complete.

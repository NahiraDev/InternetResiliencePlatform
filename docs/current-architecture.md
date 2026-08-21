# Current Architecture

**Status:** authoritative for `main` at Phase 41.

## System boundary

InternetResiliencePlatform is a modular TypeScript monorepo with a Fastify API, shared domain/runtime packages, PostgreSQL integration, Dockerized production runtime, and OpenTelemetry/Prometheus observability.

```text
Clients / operators / regional probes
              |
              v
         Fastify API
              |
  +-----------+-----------------------------+
  |           |          |          |       |
 Auth/RBAC  Runtime   Autopilot  Diagnostics  Regional validation
  |           |          |          |       |
  +-----------+----------+----------+-------+
                         |
                  shared domain packages
                         |
          +--------------+--------------+
          |              |              |
       Network       Telemetry       Database
    intelligence     + metrics      PostgreSQL
          |
 endpoint / historical / regional evidence
```

## Current implemented layers

### API

`apps/api` owns HTTP transport, request correlation, authentication/authorization boundaries, health/readiness endpoints, runtime/autopilot control-plane routes, network measurement routes, and operational diagnostics.

The API deliberately keeps network mutation behind explicit runtime/autopilot policy and verification controls. Observe-only or partial states must never be documented as active host enforcement.

### Authentication and authorization

`@irp/auth` provides JWT authentication, RBAC authorization, password hashing, and the Phase 39 remote-client security primitives.

Phase 39 primitives include opaque per-device credentials, keyed digests, constant-time comparison, revocation, rotating refresh tokens, bounded remote-client scopes and bounded security-audit storage with recursive secret redaction.

The primitives are transport-independent. API route integration remains a future Phase 42 completion gate.

### Network intelligence

The network layer performs bounded measurements and derives health/reliability signals. Endpoint intelligence and historical analysis are measurement layers; they do not themselves mutate network state.

### Regional validation

Phase 41 adds `pnpm regional:online` and `scripts/regional-online-test.mjs`. The tool validates the **observed public egress identity of the probe itself**, including country code, rather than inferring geography from the destination being tested.

For an Iranian result, an actual independent Iranian egress/probe is required. A remote runner outside Iran cannot be labelled Iranian merely because it queried an Iranian destination.

Public IP/geolocation APIs can expose request-origin IP and country as one evidence source; their result is treated as evidence rather than absolute physical-location truth. citeturn543801search0turn543801search2

### Runtime and autopilot

`@irp/resilience-runtime` implements the closed-loop runtime contract:

`Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check → Apply → Verify → Rollback/Recovery → Telemetry/Logging`

Production mutation remains fail-closed and policy-gated.

### Observability

`@irp/telemetry` and `@irp/metrics` provide bounded metrics, diagnostics, Prometheus exposition and OpenTelemetry integration. Logs and telemetry must not contain bearer credentials, refresh tokens, device secrets or equivalent secret material.

### Persistence

PostgreSQL/Prisma is the persistence boundary. In-memory stores still present in API code are application-local runtime/test stores and must not be documented as the production persistence model.

### Deployment

The production API runs as a non-root container. Runtime writable paths are explicitly constrained through the existing Docker/Compose contract; the Corepack/pnpm cache permission regression is covered by the runtime smoke path.

## Current roadmap state

- Phase 40: merged deterministic end-to-end validation infrastructure; final CI evidence must still be checked before claiming full completion.
- Phase 41: online regional validation tooling implemented; independent Iranian-vantage validation pending.
- Phase 42–48: planned distributed-resilience and production-certification work.

## Non-goals currently

The following must not be described as implemented production capabilities unless the code and verification gates are subsequently changed:

- unrestricted network scanning;
- automatic censorship/access-control bypass;
- active host routing mutation from observation endpoints;
- production-grade VPN/tunnel enforcement merely because tunnel abstractions exist;
- a completed Android/iOS UI;
- a fully integrated remote-device authentication lifecycle before Phase 42 is complete.

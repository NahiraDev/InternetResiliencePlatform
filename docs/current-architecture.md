# Architecture

**Status:** authoritative description of the implementation on `main`.

## System boundary

InternetResiliencePlatform is a modular TypeScript monorepo with a Fastify API, shared domain/runtime packages, PostgreSQL/Prisma persistence, Dockerized runtime, and Prometheus/OpenTelemetry observability.

```text
Clients / operators
        |
        v
   Fastify API
        |
  +-----+-----------------------------+
  |     |        |          |          |
 Auth  Runtime  Network   Diagnostics  Regional evidence
  |     |        |          |          |
  +-----+--------+----------+----------+
                 |
          Shared domain packages
                 |
       +---------+----------+
       |                    |
   Persistence         Telemetry
 PostgreSQL/Prisma   Prometheus/OTel
```

## Major components

### API

`apps/api` owns HTTP transport, request correlation, authentication/authorization boundaries, health/readiness endpoints, runtime/autopilot control-plane routes, network measurement routes, and operational diagnostics.

Network mutation is not implied by an observation endpoint. Mutating operations must remain behind explicit runtime policy, capability checks, verification, and recovery controls.

### Authentication and authorization

`@irp/auth` provides authentication and RBAC primitives, including password hashing, JWT handling, device-oriented credentials, revocation, refresh-token rotation, bounded remote-client scopes, and security-audit support.

A primitive existing in a package is not evidence that every transport or client lifecycle is production-integrated. Integration status is tracked separately in `PROJECT_STATE.md` and the roadmap.

### Network intelligence

The network subsystem performs bounded measurements and derives health and reliability signals. Endpoint intelligence and historical analysis are measurement layers; they do not independently mutate host networking.

### Runtime and autopilot

The resilience runtime implements the control-loop boundary:

`Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check → Apply → Verify → Rollback/Recovery → Telemetry`

Production mutation is fail-closed and policy-gated. Capability abstractions must not be described as active host enforcement unless a verified implementation exists.

### Regional validation

`pnpm regional:online` validates the public egress identity observed by the probe itself. A destination being located in a country does not make the caller originate from that country.

Regional validation therefore requires an independent regional vantage when geography is part of the assertion. The validation workflow is evidence collection, not a substitute for a real regional runner.

### Persistence

PostgreSQL/Prisma is the production persistence boundary. In-memory stores may be used for local runtime behavior, deterministic tests, and adapters, but are not the production database model.

### Observability

`@irp/telemetry` and `@irp/metrics` provide metrics, diagnostics, Prometheus exposition, and OpenTelemetry integration. Telemetry and logs must not expose bearer credentials, refresh tokens, device secrets, or equivalent secret material.

### Deployment

The production API runs as a non-root container. Writable runtime paths are explicitly controlled by the Docker contract, including the Corepack/pnpm cache permission protections required by the container smoke path.

## Documentation boundaries

This file describes architecture that exists on `main`. Detailed subsystem contracts belong under `docs/architecture/`; operational procedures belong under `docs/operations/`; historical phase evidence belongs under `docs/phases/`.

Planned architecture must be labelled as planned and should normally be documented in `ROADMAP.md` or an ADR rather than presented as implemented behavior.

## Current limitations

Do not describe the following as completed production capabilities without corresponding implementation and verification evidence:

- unrestricted network scanning;
- automatic censorship/access-control bypass;
- active host routing mutation from observation endpoints;
- production VPN/tunnel enforcement merely because tunnel abstractions exist;
- completed mobile clients;
- a fully integrated remote-device authentication lifecycle before its integration gate is complete.

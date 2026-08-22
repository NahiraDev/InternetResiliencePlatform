# System Architecture

IRP is a pnpm/Turborepo TypeScript monorepo. The architecture separates transport, domain services, network intelligence, resilience runtime, persistence, and telemetry.

## High-level flow

```text
Client / Operator
      |
      v
Fastify API
      |
      +--> Authentication / Authorization
      |
      +--> Application services
              |
              +--> Network Intelligence
              |
              +--> Resilience Runtime
              |
              +--> Connectivity / Providers
              |
              +--> Persistence
              |
              +--> Events / Telemetry
```

## Workspace boundaries

- `apps/api` — HTTP application boundary.
- `packages/network-intelligence` — network measurement/intelligence primitives.
- `packages/resilience-runtime` — observation, decision, adapter, and recovery control-plane abstractions.
- `packages/connectivity` — connectivity abstractions and implementations.
- shared packages — types, configuration, events, logging, metrics, persistence, and other domain infrastructure.

## Dependency rule

Transport code should depend on application/domain contracts rather than embedding network mutation logic. Network actions should flow through explicit capabilities/providers and remain subject to policy and verification.

## State

State is divided into short-lived runtime state, durable application state, and telemetry/diagnostic state. Persistence and caches must not be treated as interchangeable.

## Failure model

A subsystem failure should remain localized where possible. The runtime must distinguish observation failure from action failure and action failure from verification failure.

## Implementation status

This document describes architecture present in the repository. Planned components must be labelled as planned in the roadmap rather than represented as implemented system layers.

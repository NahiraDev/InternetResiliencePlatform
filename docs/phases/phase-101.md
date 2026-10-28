# Phase 101 — Streaming Metrics & Events

## Status

**Implemented pending exact-SHA CI evidence.** A bounded telemetry channel with explicit backpressure is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Fan out telemetry records to subscribers with bounded queues and loss accounting without ever blocking the producer or the control loop.

## Dependencies

- Phase 100 — Unified Telemetry Plane

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/telemetry-plane/streaming.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Per-subscriber bounded queues with drop-oldest, drop-newest or reject policy.
- Filters and consumer failures isolated from the producer.
- Per-subscription delivery, drop and reject statistics.

## Non-goals

- A second event bus or evidence authority.
- Network transport.

## Evidence map

| Criterion | Location |
| --- | --- |
| Backpressure policy is honoured and counted. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |
| A throwing filter or consumer never reaches the producer. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |
| Duplicate subscriptions are rejected. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |

## Acceptance criteria

1. Backpressure policy is honoured and counted.
2. A throwing filter or consumer never reaches the producer.
3. Duplicate subscriptions are rejected.

## Verification boundary

- Package unit tests for `@irp/resilience-runtime`.
- Existing CI that runs those suites.
- No claim of live-environment, device or production validation until exact-SHA CI and runtime evidence exist.

## Rollback considerations

- The module is additive and side-effect free at import time; removing its barrel export reverts the phase.
- Nothing here mutates network state; any resulting action flows through the existing safety kernel and privileged
  mutation boundary.

## Related issues

- Tracking: open roadmap workstream
- External blockers remain in issues #254, #272, #284 and #323

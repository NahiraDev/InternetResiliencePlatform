# Phase 148 — Horizontal Scale & Backpressure Engineering

## Status

**Implemented pending exact-SHA CI evidence.** Overload-protection primitives are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Bound load with token buckets, priority queues that shed lowest priority first, adaptive concurrency limits, circuit breakers and consistent hashing.

## Dependencies

- Phase 146 — Control-Plane High Availability

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/scale/backpressure.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Token bucket and bounded priority queue.
- AIMD limiter and circuit breaker.
- Consistent hash ring for shard ownership.

## Non-goals

- Unbounded queues.

## Evidence map

| Criterion | Location |
| --- | --- |
| Protected work is never shed. | `packages/resilience-runtime/tests/phase-146-150-scale.test.ts` |
| Overload shrinks concurrency. | `packages/resilience-runtime/tests/phase-146-150-scale.test.ts` |
| Node removal only moves its own keys. | `packages/resilience-runtime/tests/phase-146-150-scale.test.ts` |

## Acceptance criteria

1. Protected work is never shed.
2. Overload shrinks concurrency.
3. Node removal only moves its own keys.

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

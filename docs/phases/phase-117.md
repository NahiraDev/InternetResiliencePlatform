# Phase 117 — Distributed Control & Coordination

## Status

**Implemented pending exact-SHA CI evidence.** Lease-based leadership with fencing tokens is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Provide single-leader coordination with strictly increasing fencing tokens over an atomic store port so a deposed leader is rejected.

## Dependencies

- Phase 114 — Fleet Management Foundation
- Phase 77 — Safety, Rollback & Recovery Kernel

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/fleet/coordination.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Acquire, renew and release over compare-and-set.
- Fencing assertion for stale tokens.
- In-memory store for tests and single-node use.

## Non-goals

- Choosing a consensus system.

## Evidence map

| Criterion | Location |
| --- | --- |
| One leader holds a valid lease at a time. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| New holders always receive a higher token. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| Stale tokens are rejected. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |

## Acceptance criteria

1. One leader holds a valid lease at a time.
2. New holders always receive a higher token.
3. Stale tokens are rejected.

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

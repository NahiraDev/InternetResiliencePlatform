# Phase 147 — Distributed State Consistency & Conflict Recovery

## Status

**Implemented pending exact-SHA CI evidence.** Version-vector replication with explicit conflict reporting is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Detect concurrent writes precisely, resolve them by a declared deterministic policy and report every conflict, with an add-wins observed-remove set.

## Dependencies

- Phase 146 — Control-Plane High Availability

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/scale/consistency.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Version vectors and causal ordering.
- Idempotent commutative merge.
- Conflict records and observed-remove set.

## Non-goals

- Silent last-write-wins.

## Evidence map

| Criterion | Location |
| --- | --- |
| Concurrent writes are detected. | `packages/resilience-runtime/tests/phase-146-150-scale.test.ts` |
| Replicas converge. | `packages/resilience-runtime/tests/phase-146-150-scale.test.ts` |
| Conflicts are recorded. | `packages/resilience-runtime/tests/phase-146-150-scale.test.ts` |

## Acceptance criteria

1. Concurrent writes are detected.
2. Replicas converge.
3. Conflicts are recorded.

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

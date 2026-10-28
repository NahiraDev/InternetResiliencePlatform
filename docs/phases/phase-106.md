# Phase 106 — Telemetry-Driven Closed-Loop Assurance

## Status

**Implemented pending exact-SHA CI evidence.** Objective evaluation and observation projection are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Evaluate SLO-style objectives with error budgets from time-series data and feed violations into the existing loop as standard observations.

## Dependencies

- Phase 104 — Historical Network State & Time-Series Intelligence
- Phase 105 — Anomaly Detection
- Phase 78 — Bounded Closed-Loop Controller

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/telemetry-plane/closed-loop-assurance.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Objectives with comparator, target, window and minimum points.
- Met, at-risk, violated and insufficient-data states.
- An ObservationProvider that returns assurance observations.

## Non-goals

- Direct actuation or a parallel control loop.

## Evidence map

| Criterion | Location |
| --- | --- |
| Objective states reflect compliance and error budget. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |
| Invalid objective sets are rejected. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |
| Violations reach the loop only as observations. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |

## Acceptance criteria

1. Objective states reflect compliance and error budget.
2. Invalid objective sets are rejected.
3. Violations reach the loop only as observations.

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

# Phase 122 — Network State Prediction

## Status

**Implemented pending exact-SHA CI evidence.** A smoothed Markov state predictor emitting advisory signals is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Predict future network state distributions and expected time to failure from observed state sequences and emit advisory signals compatible with the knowledge plane.

## Dependencies

- Phase 99 — Predictive Failover & Recovery
- Phase 121 — Network Knowledge Base

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/intelligence/state-prediction.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Laplace-smoothed transition model fitting.
- n-step distributions and expected steps to failure.
- Advisory signal only with sufficient history.

## Non-goals

- Opaque forecasting models.
- Acting on predictions directly.

## Evidence map

| Criterion | Location |
| --- | --- |
| Model rows are proper distributions. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |
| Too little history yields no signal. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |
| A uniformly healthy history is predicted stable. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |

## Acceptance criteria

1. Model rows are proper distributions.
2. Too little history yields no signal.
3. A uniformly healthy history is predicted stable.

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

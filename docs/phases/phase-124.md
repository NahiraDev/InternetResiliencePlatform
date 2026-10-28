# Phase 124 — Autonomous Optimization

## Status

**Implemented pending exact-SHA CI evidence.** Bounded, reversible parameter tuning is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Tune declared runtime parameters within hard limits through single trials that revert automatically on regression, gated by intent autonomy level.

## Dependencies

- Phase 96 — Dynamic Route Optimization
- Phase 79 — NetworkIntent Model
- Phase 123 — Decision Intelligence & AI Assistance

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/intelligence/autonomous-optimization.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Limits, maximum step, cooldown and daily change budget.
- One trial at a time with early revert on regression.
- Audit history for every decision.

## Non-goals

- Selecting network actions.

## Evidence map

| Criterion | Location |
| --- | --- |
| Only SAFE_AUTOMATION and AUTONOMOUS levels may change parameters. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |
| Regressions revert immediately. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |
| Abort restores the pre-trial value. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |

## Acceptance criteria

1. Only SAFE_AUTOMATION and AUTONOMOUS levels may change parameters.
2. Regressions revert immediately.
3. Abort restores the pre-trial value.

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

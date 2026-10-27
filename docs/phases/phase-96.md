# Phase 96 — Dynamic Route Optimization

## Status

**Implemented pending exact-SHA CI evidence.** Hysteresis-bounded route optimization advisory is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Recommend route switches only when improvement clears a margin, dwell has elapsed and the flap budget allows, emitting planner-visible candidates rather than executing changes.

## Dependencies

- Phase 93 — Advanced Routing Control
- Phase 95 — Policy-Based Routing
- Phase 78 — Bounded Closed-Loop Controller

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/traffic/route-optimization.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Comparison of the active route with the best fabric candidate.
- Improvement margin, minimum dwell and flap budget.
- Conversion of a switch verdict into a `route_change` `CandidateAction`.

## Non-goals

- Executing a route change.
- Unbounded background optimization.

## Evidence map

| Criterion | Location |
| --- | --- |
| Margin, dwell and flap behaviour | `packages/resilience-runtime/tests/phase-94-99-traffic.test.ts` |

## Acceptance criteria

1. Switch only beyond hysteresis, dwell and flap constraints unless the active route is ineligible.
2. Only `switch` verdicts yield candidates.
3. All changes remain subject to the closed-loop and safety kernel.

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

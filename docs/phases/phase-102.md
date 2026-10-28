# Phase 102 — Cross-Layer Event Correlation

## Status

**Implemented pending exact-SHA CI evidence.** Layer-ordered correlation with root-cause attribution is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Group telemetry from different layers by correlation id and time proximity and attribute the lowest failing layer as the root cause candidate.

## Dependencies

- Phase 100 — Unified Telemetry Plane
- Phase 101 — Streaming Metrics & Events

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/telemetry-plane/correlation.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Union-find grouping by correlation id and same-owner failure proximity.
- Causal layer ordering and downstream explanation.
- Confidence derived from evidence rather than asserted.

## Non-goals

- Acting on a diagnosis.

## Evidence map

| Criterion | Location |
| --- | --- |
| The lowest failing layer is the root cause candidate. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |
| Distant incidents stay separate. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |
| Grouping is order independent. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |

## Acceptance criteria

1. The lowest failing layer is the root cause candidate.
2. Distant incidents stay separate.
3. Grouping is order independent.

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

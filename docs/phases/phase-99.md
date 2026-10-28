# Phase 99 — Predictive Failover & Recovery

## Status

**Implemented pending exact-SHA CI evidence.** Trend-based failover advisories and recovery gating are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Predict health-threshold breaches from trends, pre-arm a standby through the fabric selection boundary and gate fail-back on sustained recovery.

## Dependencies

- Phase 96 — Dynamic Route Optimization
- Phase 98 — Congestion & Degradation Awareness
- Phase 77 — Safety, Rollback & Recovery Kernel

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/traffic/predictive-failover.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Least-squares trend with significance threshold and breach-time estimate.
- Advisory urgency levels and standby selection via `fabric.select`.
- Recovery readiness by consecutive healthy samples and dwell.

## Non-goals

- Executing failover or fail-back.
- Opaque ML models.

## Evidence map

| Criterion | Location |
| --- | --- |
| Prediction, standby and recovery gating | `packages/resilience-runtime/tests/phase-94-99-traffic.test.ts` |

## Acceptance criteria

1. Insufficient or insignificant trends never advise failover.
2. A standby is chosen only through the fabric boundary.
3. Recovery requires both consecutive healthy samples and dwell.

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

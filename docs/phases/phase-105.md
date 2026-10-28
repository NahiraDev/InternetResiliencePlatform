# Phase 105 — Anomaly Detection

## Status

**Implemented pending exact-SHA CI evidence.** Robust z-score, EWMA band and CUSUM detectors are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Provide explainable, warm-up gated anomaly detection with cooldown that cannot normalize its own spikes.

## Dependencies

- Phase 104 — Historical Network State & Time-Series Intelligence

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/telemetry-plane/anomaly.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Median/MAD robust z-score, EWMA control band and CUSUM change point.
- Warm-up, cooldown and baseline exclusion of anomalous points.

## Non-goals

- Opaque ML models
- Actuation.

## Evidence map

| Criterion | Location |
| --- | --- |
| No findings before warm-up. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |
| Spikes are excluded from the baseline and rate limited. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |
| Non-finite input is ignored. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |

## Acceptance criteria

1. No findings before warm-up.
2. Spikes are excluded from the baseline and rate limited.
3. Non-finite input is ignored.

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

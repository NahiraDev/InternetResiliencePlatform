# Phase 104 — Historical Network State & Time-Series Intelligence

## Status

**Implemented pending exact-SHA CI evidence.** A tiered in-memory time-series store with rollups is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Provide bounded, tiered retention, deterministic bucketed rollups and window comparison for network metrics.

## Dependencies

- Phase 100 — Unified Telemetry Plane

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/telemetry-plane/time-series.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Retention tiers, expiry and resolution selection.
- Min, max, mean and p95 rollups.
- Window comparison for baselines.

## Non-goals

- Durable persistence, which remains with the persistence boundary.

## Evidence map

| Criterion | Location |
| --- | --- |
| Rollups are deterministic. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |
| Retention tiers are validated and expired data is removed. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |
| Invalid points are rejected. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |

## Acceptance criteria

1. Rollups are deterministic.
2. Retention tiers are validated and expired data is removed.
3. Invalid points are rejected.

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

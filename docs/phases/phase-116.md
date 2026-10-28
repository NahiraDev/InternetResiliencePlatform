# Phase 116 — Remote Configuration & Policy Distribution

## Status

**Implemented pending exact-SHA CI evidence.** Signed bundles with staged, auto-rolled-back rollout are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Distribute content-addressed signed configuration and policy bundles through canary and wave stages with failure-ratio rollback.

## Dependencies

- Phase 114 — Fleet Management Foundation
- Phase 110 — Secrets & Key Lifecycle

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/fleet/config-distribution.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- HMAC-signed bundles with content hashes and version monotonicity.
- Deterministic cohort assignment and cumulative stages.
- Acknowledgement tracking with halt or rollback on failure ratio.

## Non-goals

- Applying configuration on a device; devices apply through their own runtime.

## Evidence map

| Criterion | Location |
| --- | --- |
| Tampered or unsigned bundles are rejected. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| Cohorts are stable and stages never re-offer devices. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| Failure ratio breach rolls back or halts. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |

## Acceptance criteria

1. Tampered or unsigned bundles are rejected.
2. Cohorts are stable and stages never re-offer devices.
3. Failure ratio breach rolls back or halts.

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

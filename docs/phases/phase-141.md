# Phase 141 — Privacy-Preserving Telemetry

## Status

**Implemented pending exact-SHA CI evidence.** Deny-by-default telemetry minimization with k-anonymity and noise is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Pseudonymize, coarsen and bucket telemetry fields, suppress small groups and release noisy counts under a bounded privacy budget.

## Dependencies

- Phase 100 — Unified Telemetry Model

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/governance/privacy-telemetry.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Keyed pseudonyms with rotating epochs.
- Address coarsening and time bucketing.
- k-anonymity suppression and budgeted Laplace noise.

## Non-goals

- Re-identification or cross-epoch linkage.

## Evidence map

| Criterion | Location |
| --- | --- |
| Unknown fields are dropped. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |
| Pseudonyms rotate across epochs. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |
| Budget exhaustion refuses releases. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |

## Acceptance criteria

1. Unknown fields are dropped.
2. Pseudonyms rotate across epochs.
3. Budget exhaustion refuses releases.

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

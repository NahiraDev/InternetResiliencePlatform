# Phase 126 — Chaos, Resilience & Hardware-in-the-Loop Validation

## Status

**Implemented pending exact-SHA CI evidence.** Bounded chaos experiments with guaranteed restoration are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Run fault experiments with steady-state hypotheses, blast-radius limits and abort conditions through a fault-injection port for simulation, lab and hardware-in-the-loop rigs.

## Dependencies

- Phase 125 — Network Simulation / Digital Twin
- Phase 82 — Runtime Lab and Simulation

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/intelligence/chaos-validation.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Experiment validation including production approval and blast radius.
- Steady-state checks before and after.
- Abort conditions and unconditional restore.

## Non-goals

- Unapproved production fault injection.

## Evidence map

| Criterion | Location |
| --- | --- |
| Unsafe experiments are refused before injecting. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |
| Restoration always runs. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |
| Lost steady state fails the hypothesis. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |

## Acceptance criteria

1. Unsafe experiments are refused before injecting.
2. Restoration always runs.
3. Lost steady state fails the hypothesis.

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

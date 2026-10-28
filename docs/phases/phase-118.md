# Phase 118 — Multi-Device Orchestration

## Status

**Implemented pending exact-SHA CI evidence.** Dependency-ordered, bounded, abortable orchestration is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Run an operation across devices in dependency waves with concurrency limits, timeouts, abort and halt or continue failure policy via a port to each device's runtime.

## Dependencies

- Phase 116 — Remote Configuration & Policy Distribution
- Phase 117 — Distributed Control & Coordination
- Phase 115 — Device Enrollment & Lifecycle

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/fleet/orchestration.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Wave planning with cycle and unknown-dependency detection.
- Concurrency, per-device timeout and abort handling.
- Operational-device gating.

## Non-goals

- Direct device mutation.

## Evidence map

| Criterion | Location |
| --- | --- |
| Dependents of failed steps are skipped. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| Concurrency and timeouts are enforced. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| Invalid plans are rejected before running. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |

## Acceptance criteria

1. Dependents of failed steps are skipped.
2. Concurrency and timeouts are enforced.
3. Invalid plans are rejected before running.

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

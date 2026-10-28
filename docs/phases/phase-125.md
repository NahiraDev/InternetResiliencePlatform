# Phase 125 — Network Simulation / Digital Twin

## Status

**Implemented pending exact-SHA CI evidence.** An isolated fabric twin with impact analysis is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Apply hypothetical faults or changes to an isolated copy of the fabric and report selection, redundancy and stranded-dependent impact using live selection logic.

## Dependencies

- Phase 103 — Topology & Dependency Intelligence
- Phase 93 — Advanced Routing Control

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/intelligence/digital-twin.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Fail, degrade, recover, cost and failure-domain changes.
- Before and after selection comparison via the fabric.
- Verdicts: no impact, degraded redundancy, reroute and outage.

## Non-goals

- Mutating live resources.

## Evidence map

| Criterion | Location |
| --- | --- |
| The input snapshot is never modified. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |
| Reroutes and outages are detected. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |
| Unknown targets are rejected. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |

## Acceptance criteria

1. The input snapshot is never modified.
2. Reroutes and outages are detected.
3. Unknown targets are rejected.

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

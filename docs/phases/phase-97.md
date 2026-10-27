# Phase 97 — Service Reachability Intelligence

## Status

**Implemented pending exact-SHA CI evidence.** Per-service, per-path reachability ledger is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Derive service reachability verdicts with failure-layer attribution from bounded probe evidence.

## Dependencies

- Phase 92 — Connectivity Service Assurance
- Phase 91 — Application-Aware Path Selection

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/traffic/reachability.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Sliding-window probe ledger keyed by service and path.
- Reachable, degraded, unreachable and unknown verdicts with staleness handling.
- Service-level state that reports an outage only when every path is unreachable.

## Non-goals

- Performing probes; observation providers own probing.

## Evidence map

| Criterion | Location |
| --- | --- |
| Verdicts, staleness and service state | `packages/resilience-runtime/tests/phase-94-99-traffic.test.ts` |

## Acceptance criteria

1. Stale evidence yields `unknown` with zero confidence.
2. Failed probes must name the failing layer.
3. Dominant failure layer is attributed deterministically.

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

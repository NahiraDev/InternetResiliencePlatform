# Phase 98 — Congestion & Degradation Awareness

## Status

**Implemented pending exact-SHA CI evidence.** Congestion tracking with hysteresis is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Classify congestion from utilisation, bufferbloat and loss with confirmation and exit hysteresis, and derate resources for advisory ranking without modifying the fabric snapshot.

## Dependencies

- Phase 96 — Dynamic Route Optimization
- Phase 92 — Connectivity Service Assurance

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/traffic/congestion.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- EWMA pressure from utilisation, latency inflation and loss.
- Level changes require sustained confirmation and exit margins.
- Derated resource copies for advisory ranking.

## Non-goals

- Traffic shaping or queue management.

## Evidence map

| Criterion | Location |
| --- | --- |
| Escalation, hysteresis and bufferbloat | `packages/resilience-runtime/tests/phase-94-99-traffic.test.ts` |

## Acceptance criteria

1. Single spikes do not change level.
2. Clearing requires pressure below the entry threshold by the exit margin.
3. Inputs are never mutated.

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

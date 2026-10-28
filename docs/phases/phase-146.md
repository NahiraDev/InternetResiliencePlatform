# Phase 146 — Control-Plane High Availability

## Status

**Implemented pending exact-SHA CI evidence.** Quorum-gated leadership with fencing tokens is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Run the control plane as a replica group with heartbeat liveness, majority quorum, monotonically increasing terms and fenced writes that fail safe without quorum.

## Dependencies

- Phase 114 — Fleet Inventory
- Phase 118 — Distributed Coordination

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/scale/control-plane-ha.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Heartbeat liveness and deterministic election.
- Terms and fencing tokens.
- Fenced resource writes.

## Non-goals

- Leader election without quorum.

## Evidence map

| Criterion | Location |
| --- | --- |
| No quorum means no leader. | `packages/resilience-runtime/tests/phase-146-150-scale.test.ts` |
| Deposed leaders are rejected. | `packages/resilience-runtime/tests/phase-146-150-scale.test.ts` |
| Stale fencing tokens are refused. | `packages/resilience-runtime/tests/phase-146-150-scale.test.ts` |

## Acceptance criteria

1. No quorum means no leader.
2. Deposed leaders are rejected.
3. Stale fencing tokens are refused.

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

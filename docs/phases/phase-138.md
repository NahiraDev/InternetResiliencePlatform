# Phase 138 — Capability Discovery & Provider Directory

## Status

**Implemented pending exact-SHA CI evidence.** A heartbeat-based capability directory is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Discover live providers by capability, version range and region with deterministic resolution and gap reporting.

## Dependencies

- Phase 137 — Plugin/Provider Lifecycle Governance

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/control-api/capability-directory.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Version-range matching.
- Heartbeat liveness and sweeping.
- Deterministic ranking and gap detection.

## Non-goals

- Granting authority by discovery.

## Evidence map

| Criterion | Location |
| --- | --- |
| Dead providers are never resolved. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |
| Ranking is deterministic. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |
| Missing capabilities are reported. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |

## Acceptance criteria

1. Dead providers are never resolved.
2. Ranking is deterministic.
3. Missing capabilities are reported.

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

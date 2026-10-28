# Phase 103 — Topology & Dependency Intelligence

## Status

**Implemented pending exact-SHA CI evidence.** Fabric-derived dependency graph analysis is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Derive blast radius, single points of failure, shared failure domains and dependency order from a fabric snapshot.

## Dependencies

- Phase 86 — Fabric Regression
- Phase 102 — Cross-Layer Event Correlation

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/telemetry-plane/topology.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Immutable dependency graph over fabric resources and edges.
- Transitive impact, SPOF and shared-domain analysis.
- Topological order with explicit cycle errors.

## Non-goals

- A second topology owner.
- Discovery of resources.

## Evidence map

| Criterion | Location |
| --- | --- |
| Impact is transitive and deterministic. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |
| SPOF requires no same-kind alternative. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |
| Cycles are reported with the cycle path. | `packages/resilience-runtime/tests/phase-100-106-telemetry-plane.test.ts` |

## Acceptance criteria

1. Impact is transitive and deterministic.
2. SPOF requires no same-kind alternative.
3. Cycles are reported with the cycle path.

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

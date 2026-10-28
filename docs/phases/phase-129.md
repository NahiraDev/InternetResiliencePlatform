# Phase 129 — Flow / Connection Lifecycle Intelligence

## Status

**Implemented pending exact-SHA CI evidence.** A bounded flow table with lifecycle states and migration safety is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Track flow lifecycle, idle timeouts and long-lived flows, and decide whether a flow can be moved without breaking it.

## Dependencies

- Phase 94 — Traffic Classification

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/dataplane/flow-lifecycle.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Lifecycle states and counters.
- Idle sweeping and capacity eviction.
- Migration safety and pinned-flow queries.

## Non-goals

- Packet capture or inspection.

## Evidence map

| Criterion | Location |
| --- | --- |
| Established non-migratable flows are pinned. | `packages/resilience-runtime/tests/phase-128-134-dataplane.test.ts` |
| Idle flows stall then close. | `packages/resilience-runtime/tests/phase-128-134-dataplane.test.ts` |
| Eviction is counted. | `packages/resilience-runtime/tests/phase-128-134-dataplane.test.ts` |

## Acceptance criteria

1. Established non-migratable flows are pinned.
2. Idle flows stall then close.
3. Eviction is counted.

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

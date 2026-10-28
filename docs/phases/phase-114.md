# Phase 114 — Fleet Management Foundation

## Status

**Implemented pending exact-SHA CI evidence.** A tenant-scoped fleet inventory with selector queries is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Track managed devices with platform, version, labels and heartbeats and query them by selector without conferring any authority.

## Dependencies

- Phase 108 — Device Identity & Enrollment Trust

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/fleet/inventory.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Tenant-owned device records with immutable updates.
- Selector queries over tenant, platform, region, labels and version range.
- Grouping and staleness queries.

## Non-goals

- Granting trust or authorization from inventory membership.

## Evidence map

| Criterion | Location |
| --- | --- |
| Device ids cannot cross tenants. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| Selectors are deterministic and ordered. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| Staleness derives from heartbeats. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |

## Acceptance criteria

1. Device ids cannot cross tenants.
2. Selectors are deterministic and ordered.
3. Staleness derives from heartbeats.

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

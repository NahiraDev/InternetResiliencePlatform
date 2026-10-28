# Phase 120 — Fleet Health & Observability

## Status

**Implemented pending exact-SHA CI evidence.** Tenant-scoped fleet health rollups with SLO status are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Aggregate device presence and health into availability, degradation and version-skew rollups with ranked offenders.

## Dependencies

- Phase 114 — Fleet Management Foundation
- Phase 115 — Device Enrollment & Lifecycle
- Phase 106 — Telemetry-Driven Closed-Loop Assurance

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/fleet/fleet-health.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Latest-report selection and freshness handling.
- Availability, degraded ratio and version skew.
- SLO violation reporting.

## Non-goals

- Cross-tenant aggregation.

## Evidence map

| Criterion | Location |
| --- | --- |
| Lost or silent devices count as unknown. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| SLO violations are enumerated. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| Mixed-tenant input is refused. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |

## Acceptance criteria

1. Lost or silent devices count as unknown.
2. SLO violations are enumerated.
3. Mixed-tenant input is refused.

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

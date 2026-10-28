# Phase 119 — Tenant / Organization Isolation

## Status

**Implemented pending exact-SHA CI evidence.** A tenant-partitioned store with quotas and audited denial is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Guarantee tenant isolation with mandatory context, partitioned storage, quotas and audited cross-tenant denial.

## Dependencies

- Phase 109 — Authorization / Capability Model
- Phase 114 — Fleet Management Foundation

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/fleet/tenant-isolation.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Tenant-partitioned storage with no all-tenants read.
- Per-tenant quotas.
- Cross-tenant violations audited.

## Non-goals

- Billing or tenant provisioning.

## Evidence map

| Criterion | Location |
| --- | --- |
| Cross-tenant access is denied and logged. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| Quotas are enforced per tenant. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| A tenant context is mandatory. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |

## Acceptance criteria

1. Cross-tenant access is denied and logged.
2. Quotas are enforced per tenant.
3. A tenant context is mandatory.

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

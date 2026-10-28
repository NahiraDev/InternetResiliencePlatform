# Phase 95 — Policy-Based Routing

## Status

**Implemented pending exact-SHA CI evidence.** Declarative routing policies resolve onto the fabric selection request. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Map traffic classifications onto fabric selection constraints through validated, ordered policies with a fail-closed deny path.

## Dependencies

- Phase 93 — Advanced Routing Control
- Phase 94 — Traffic Classification
- Phase 82 — Intent-scoped Policy Decision & Enforcement

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/traffic/policy-routing.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Ordered policy rules matching class, application, tenant and UTC window.
- Constraint translation into `FabricSelectionRequest`.
- Deny rules and invalid policy sets fail closed before reaching `fabric.select`.

## Non-goals

- A second policy engine or arbitration path.
- Direct resource selection.

## Evidence map

| Criterion | Location |
| --- | --- |
| Policy-narrowed selection | `packages/resilience-runtime/tests/phase-94-99-traffic.test.ts` |
| Deny and fail-closed behaviour | `same` |

## Acceptance criteria

1. Policies only narrow or order fabric selection.
2. Deny and invalid sets never invoke fabric selection.
3. Priority collisions and malformed constraints are rejected.

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

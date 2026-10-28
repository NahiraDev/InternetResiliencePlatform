# Phase 128 — Data-Plane Abstraction & Enforcement

## Status

**Implemented pending exact-SHA CI evidence.** A vendor-neutral rule model with a transactional enforcement compiler is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Compile desired data-plane rules into ordered make-before-break operation plans with exact inverses, validated against backend capabilities and applied only under a governed transaction.

## Dependencies

- Phase 93 — Advanced Routing Control
- Phase 82 — Policy Decision & Enforcement

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/dataplane/abstraction.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Rule model, capability validation and rule budgets.
- Plans with exact inverse operations.
- Transactional apply with rollback.

## Non-goals

- Direct backend mutation outside a governed transaction.

## Evidence map

| Criterion | Location |
| --- | --- |
| Unsupported actions are rejected. | `packages/resilience-runtime/tests/phase-128-134-dataplane.test.ts` |
| Failures roll back applied operations. | `packages/resilience-runtime/tests/phase-128-134-dataplane.test.ts` |
| Ungoverned apply is refused. | `packages/resilience-runtime/tests/phase-128-134-dataplane.test.ts` |

## Acceptance criteria

1. Unsupported actions are rejected.
2. Failures roll back applied operations.
3. Ungoverned apply is refused.

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

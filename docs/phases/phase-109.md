# Phase 109 — Authorization / Capability Model

## Status

**Implemented pending exact-SHA CI evidence.** Scoped, attenuating capability grants are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Provide expiring scoped grants with deny-wins evaluation, attenuating delegation and cascading revocation that project onto the existing actor model.

## Dependencies

- Phase 108 — Device Identity & Enrollment Trust
- Phase 82 — Policy Decision & Enforcement

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/control-security/capability-grants.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Grant scope over tenant, device and resource.
- Delegation cannot exceed capability, scope or lifetime.
- Projection onto ActorIdentity so the trust-boundary authorizer keeps boundary ceilings.

## Non-goals

- A second authorizer.

## Evidence map

| Criterion | Location |
| --- | --- |
| Explicit deny always wins. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |
| Delegation attenuates and revocation cascades. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |
| Grants cannot exceed boundary ceilings. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |

## Acceptance criteria

1. Explicit deny always wins.
2. Delegation attenuates and revocation cascades.
3. Grants cannot exceed boundary ceilings.

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

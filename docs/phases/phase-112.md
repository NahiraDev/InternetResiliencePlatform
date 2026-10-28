# Phase 112 — Security Policy & Runtime Enforcement

## Status

**Implemented pending exact-SHA CI evidence.** Ordered security rules with default deny are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Evaluate declarative security rules at runtime and adapt the result to the privileged boundary's security gate so both policy and authorizer must pass.

## Dependencies

- Phase 109 — Authorization / Capability Model
- Phase 82 — Policy Decision & Enforcement

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/control-security/security-policy.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Rules over boundary, capability, risk, device trust, mode and time.
- Require-approval and default-deny effects.
- Adapter to SecurityGateInput.

## Non-goals

- A second policy engine for network policy.

## Evidence map

| Criterion | Location |
| --- | --- |
| Default deny with duplicate-id fail-closed. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |
| High risk requires approval. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |
| The gate adapter denies unless both agree. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |

## Acceptance criteria

1. Default deny with duplicate-id fail-closed.
2. High risk requires approval.
3. The gate adapter denies unless both agree.

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

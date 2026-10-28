# Phase 107 — Secure Control-Plane Architecture

## Status

**Implemented pending exact-SHA CI evidence.** A declarative channel-security contract and fail-closed assessor are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Declare and assess the transport and authentication properties of every control channel so remote and plugin channels can never be privileged-capable.

## Dependencies

- Phase 78 — Security, Safety and Transactions
- Phase 82 — Policy Decision & Enforcement

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/control-security/control-plane-security.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Per-kind channel requirements for TLS, mutual auth, signing, replay protection and size limits.
- Fail-closed plane posture on any critical finding.
- Privileged mutation requests from untrusted boundaries are findings.

## Non-goals

- A new transport implementation.
- A second authorization path.

## Evidence map

| Criterion | Location |
| --- | --- |
| Weak or missing controls produce critical findings. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |
| Remote and plugin boundaries cannot request privileged mutation. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |
| An empty or duplicated channel set is insecure. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |

## Acceptance criteria

1. Weak or missing controls produce critical findings.
2. Remote and plugin boundaries cannot request privileged mutation.
3. An empty or duplicated channel set is insecure.

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

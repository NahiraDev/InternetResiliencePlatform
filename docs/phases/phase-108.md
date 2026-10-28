# Phase 108 — Device Identity & Enrollment Trust

## Status

**Implemented pending exact-SHA CI evidence.** Token-based enrollment with proof-of-possession and a trust state machine is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Bind devices to Ed25519 public-key fingerprints through single-use, expiring, signed enrollment tokens and an explicit trust lifecycle.

## Dependencies

- Phase 107 — Secure Control-Plane Architecture

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/control-security/device-identity.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- HMAC-signed enrollment tokens with lifetime checks.
- Ed25519 proof-of-possession and fingerprint binding.
- Enrolled, suspended and revoked trust transitions with history.

## Non-goals

- Certificate authority operation.
- Persisting identities.

## Evidence map

| Criterion | Location |
| --- | --- |
| Tokens are single use and forgery is rejected. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |
| Enrollment requires a valid proof of possession. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |
| Revoked identities can never be re-enrolled. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |

## Acceptance criteria

1. Tokens are single use and forgery is rejected.
2. Enrollment requires a valid proof of possession.
3. Revoked identities can never be re-enrolled.

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

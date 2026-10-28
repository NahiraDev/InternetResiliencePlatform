# Phase 110 — Secrets & Key Lifecycle

## Status

**Implemented pending exact-SHA CI evidence.** Versioned key lifecycle with envelope encryption is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Manage key versions with rotation, overlap, retirement, revocation and destruction and provide AES-256-GCM sealing bound to key version and context.

## Dependencies

- Phase 108 — Device Identity & Enrollment Trust

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/control-security/key-lifecycle.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Rotation policy with maximum age, overlap and destruction delay.
- Sealing bound to key, version and additional data.
- Material zeroisation on revoke or destroy; only fingerprints are exposed.

## Non-goals

- External KMS integration.
- Persisting wrapped keys.

## Evidence map

| Criterion | Location |
| --- | --- |
| Rotation keeps old ciphertext readable only during overlap. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |
| Revoked keys are unrecoverable. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |
| Tampering is detected. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |

## Acceptance criteria

1. Rotation keeps old ciphertext readable only during overlap.
2. Revoked keys are unrecoverable.
3. Tampering is detected.

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

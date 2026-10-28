# Phase 111 — Secure Agent ↔ Control Plane Protocol

## Status

**Implemented pending exact-SHA CI evidence.** Authenticated, replay-protected message envelopes are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Define signed envelopes with HKDF session keys, bounded skew, monotonic sequences and a bounded nonce cache for agent traffic.

## Dependencies

- Phase 107 — Secure Control-Plane Architecture
- Phase 110 — Secrets & Key Lifecycle

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/control-security/agent-protocol.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- HMAC envelopes over a canonical header and body hash.
- Per-direction message allow-lists.
- Replay, sequence, skew and size enforcement.

## Non-goals

- Transport implementation.
- Agent-initiated privileged mutation.

## Evidence map

| Criterion | Location |
| --- | --- |
| Tampered, replayed and out-of-order messages are rejected. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |
| Directions cannot cross keys or types. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |
| No message type is a privileged mutation. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |

## Acceptance criteria

1. Tampered, replayed and out-of-order messages are rejected.
2. Directions cannot cross keys or types.
3. No message type is a privileged mutation.

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

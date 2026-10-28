# Phase 115 — Device Enrollment & Lifecycle

## Status

**Implemented pending exact-SHA CI evidence.** A managed-device lifecycle with presence derivation is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Govern provisioning, activation, maintenance and decommissioning with identity-trust preconditions and heartbeat-derived presence.

## Dependencies

- Phase 108 — Device Identity & Enrollment Trust
- Phase 114 — Fleet Management Foundation

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/fleet/device-lifecycle.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Lifecycle state machine with history.
- Activation requires a trusted identity; decommissioning requires a revoked one.
- Online, stale, lost and never-seen presence.

## Non-goals

- Performing the revocation itself.

## Evidence map

| Criterion | Location |
| --- | --- |
| Illegal transitions are rejected. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| A retired device cannot keep trust. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |
| Only active and trusted devices are operational. | `packages/resilience-runtime/tests/phase-114-120-fleet.test.ts` |

## Acceptance criteria

1. Illegal transitions are rejected.
2. A retired device cannot keep trust.
3. Only active and trusted devices are operational.

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

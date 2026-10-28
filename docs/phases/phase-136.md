# Phase 136 — Event Channel & Integration Contracts

## Status

**Implemented pending exact-SHA CI evidence.** A contract-validated publish/subscribe channel with bounded delivery is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Deliver typed events at-least-once to bounded subscriber queues with duplicate suppression, retry limits and dead-lettering.

## Dependencies

- Phase 100 — Unified Telemetry Model

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/control-api/event-channel.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Declared event contracts and schemas.
- Duplicate suppression and bounded queues.
- Nack with retry limit and dead letters.

## Non-goals

- Events carrying authority.

## Evidence map

| Criterion | Location |
| --- | --- |
| Malformed events are refused. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |
| Duplicates are not redelivered. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |
| Overflow and exhausted retries are dead-lettered. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |

## Acceptance criteria

1. Malformed events are refused.
2. Duplicates are not redelivered.
3. Overflow and exhausted retries are dead-lettered.

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

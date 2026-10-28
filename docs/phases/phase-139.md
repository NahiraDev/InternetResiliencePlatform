# Phase 139 — External Integrations, Webhooks & SDK Contracts

## Status

**Implemented pending exact-SHA CI evidence.** Signed webhooks and a derived SDK contract are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Deliver signed webhooks with bounded backoff, verify inbound webhooks with replay protection and derive SDK contracts from the live API.

## Dependencies

- Phase 135 — Versioned Control-Plane API

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/control-api/integrations.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- HMAC-signed timestamped webhooks.
- Replay and staleness protection.
- Retry with exponential backoff and an SDK contract digest.

## Non-goals

- Plain-HTTP delivery.

## Evidence map

| Criterion | Location |
| --- | --- |
| Bad signatures and replays are rejected. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |
| Retries are bounded. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |
| The SDK contract mirrors the route table. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |

## Acceptance criteria

1. Bad signatures and replays are rejected.
2. Retries are bounded.
3. The SDK contract mirrors the route table.

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

# Phase 137 — Plugin/Provider Lifecycle Governance

## Status

**Implemented pending exact-SHA CI evidence.** Signed plugin manifests and a lifecycle state machine are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Verify plugin manifests, allow-list capabilities and govern lifecycle with automatic quarantine on repeated health failures.

## Dependencies

- Phase 109 — Key Lifecycle Management

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/control-api/plugin-lifecycle.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- HMAC manifest verification.
- Capability allow-list and runtime compatibility.
- State machine with quarantine and downgrade refusal.

## Non-goals

- Granting capabilities beyond the manifest.

## Evidence map

| Criterion | Location |
| --- | --- |
| Tampered manifests are rejected. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |
| Only active plugins have effective capabilities. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |
| Illegal transitions are refused. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |

## Acceptance criteria

1. Tampered manifests are rejected.
2. Only active plugins have effective capabilities.
3. Illegal transitions are refused.

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

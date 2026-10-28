# Phase 135 — Versioned Control-Plane API

## Status

**Implemented pending exact-SHA CI evidence.** A transport-independent versioned dispatcher with validation, authorization and idempotency is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Expose runtime operations through versioned routes with closed-schema validation, capability authorization, idempotency keys and a uniform error envelope.

## Dependencies

- Phase 108 — Capability Grants & Authorization
- Phase 82 — Policy Decision & Enforcement

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/control-api/versioned-api.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Versioned route table with since/until.
- Closed-schema input validation.
- Capability checks and idempotent replay.

## Non-goals

- API-held mutation authority.

## Evidence map

| Criterion | Location |
| --- | --- |
| Unauthenticated and unauthorized calls are refused. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |
| Unknown fields are rejected. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |
| Internal errors never leak details. | `packages/resilience-runtime/tests/phase-135-140-control-api.test.ts` |

## Acceptance criteria

1. Unauthenticated and unauthorized calls are refused.
2. Unknown fields are rejected.
3. Internal errors never leak details.

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

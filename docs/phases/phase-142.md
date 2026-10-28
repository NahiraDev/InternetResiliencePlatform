# Phase 142 — Data Classification, Retention & Deletion

## Status

**Implemented pending exact-SHA CI evidence.** Classification, retention, legal-hold and deletion planning are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Plan deletions from per-class retention rules while honoring legal holds and subject erasure, with tamper-evident receipts.

## Dependencies

- Phase 141 — Privacy-Preserving Telemetry

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/governance/data-lifecycle.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Classification levels and flow rules.
- Retention validation and deletion planning.
- Legal holds and deletion receipts.

## Non-goals

- Executing deletions in a store.

## Evidence map

| Criterion | Location |
| --- | --- |
| Held records are never deleted. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |
| More sensitive data is not retained longer. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |
| Receipts hold digests, not content. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |

## Acceptance criteria

1. Held records are never deleted.
2. More sensitive data is not retained longer.
3. Receipts hold digests, not content.

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

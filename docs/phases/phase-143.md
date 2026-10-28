# Phase 143 — Auditability & Immutable Control History

## Status

**Implemented pending exact-SHA CI evidence.** A hash-chained sealed history with checkpoints is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Record control decisions in an append-only chain whose edits, deletions and reordering are detectable, with prunable signed checkpoints.

## Dependencies

- Phase 142 — Data Classification, Retention & Deletion

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/governance/immutable-history.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Hash chaining and HMAC seals.
- Verification and query.
- Signed checkpoints and pruning.

## Non-goals

- External anchoring.

## Evidence map

| Criterion | Location |
| --- | --- |
| Any tamper is detected. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |
| Pruned history stays verifiable. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |
| Invalid checkpoints are refused. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |

## Acceptance criteria

1. Any tamper is detected.
2. Pruned history stays verifiable.
3. Invalid checkpoints are refused.

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

# Phase 127 — Final Production Certification & Release Readiness

## Status

**Implemented pending exact-SHA CI evidence.** An exact-SHA evidence-based readiness evaluator is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Evaluate release readiness only from fresh, trusted, passing evidence bound to the candidate commit, never from source presence or other revisions.

## Dependencies

- Phase 71 — Release Evidence Gate
- Phase 126 — Chaos, Resilience & Hardware-in-the-Loop Validation

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/intelligence/release-readiness.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Per-gate source, freshness and SHA requirements.
- Missing, stale, mismatched, untrusted, failed and skipped verdicts.
- Optional gates produce warnings only.

## Non-goals

- Producing the evidence itself or certifying around gaps.

## Evidence map

| Criterion | Location |
| --- | --- |
| Only exact-SHA evidence counts. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |
| Blockers are enumerated. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |
| The newest accepted evidence decides. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |

## Acceptance criteria

1. Only exact-SHA evidence counts.
2. Blockers are enumerated.
3. The newest accepted evidence decides.

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

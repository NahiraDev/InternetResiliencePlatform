# Phase 121 — Network Knowledge Base

## Status

**Implemented pending exact-SHA CI evidence.** An entity-centric query layer over the canonical knowledge store is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Answer what is known about a destination, provider, path or region with provenance, decayed confidence and failure memory without introducing a second knowledge store.

## Dependencies

- Phase 76 — Knowledge Plane
- Phase 104 — Historical Network State & Time-Series Intelligence

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/intelligence/knowledge-base.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Entity profiles with source and kind breakdown.
- Confidence-weighted objective evidence.
- Failure ranking and operator-readable explanations.

## Non-goals

- A separate persistence or admission path for knowledge.

## Evidence map

| Criterion | Location |
| --- | --- |
| Profiles only include live records declared for the entity. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |
| Advisory-only evidence is surfaced as such. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |
| Unknown entities are reported honestly. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |

## Acceptance criteria

1. Profiles only include live records declared for the entity.
2. Advisory-only evidence is surfaced as such.
3. Unknown entities are reported honestly.

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

# Phase 94 — Traffic Classification

## Status

**Implemented pending exact-SHA CI evidence.** Deterministic flow classification is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Classify observed flows into traffic classes and application identities that feed the existing fabric routing vocabulary without selecting or mutating routes.

## Dependencies

- Phase 91 — Application-Aware Path Selection
- Phase 93 — Advanced Routing Control

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/traffic/classification.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Prioritised, validated classification rules over protocol, port, host, DSCP and rate attributes.
- Heuristic and application-hint fallbacks with explicit confidence and basis.
- Traffic-mix summaries and compilation into the bounded `routing.*` hint vocabulary.

## Non-goals

- Deep packet inspection or payload analysis.
- Selecting or changing routes.

## Evidence map

| Criterion | Location |
| --- | --- |
| Rule, heuristic, hint and default classification | `packages/resilience-runtime/tests/phase-94-99-traffic.test.ts` |
| Rule validation | `same` |

## Acceptance criteria

1. Identical flows always classify identically and rule order is priority then id.
2. Invalid or duplicate rules are rejected.
3. Classification output maps to `routing.application` hints only.

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

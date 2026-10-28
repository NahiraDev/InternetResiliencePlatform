# Phase 123 — Decision Intelligence & AI Assistance

## Status

**Implemented pending exact-SHA CI evidence.** A bounded advisory-model integration is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Let an external model advise by re-ranking canonical candidates through an allow-listed redacted context and closed-schema replies while keeping AI advisory only.

## Dependencies

- Phase 82 — Policy Decision & Enforcement
- Phase 121 — Network Knowledge Base

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/intelligence/ai-assistance.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Allow-listed, redacted context building.
- Closed-schema reply validation.
- Bounded influence, timeout and fail-open to canonical order.

## Non-goals

- AI-authored actions, capabilities or safety changes.

## Evidence map

| Criterion | Location |
| --- | --- |
| The model cannot add candidates or promote rejected ones. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |
| Timeouts and invalid replies degrade to canonical order. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |
| Chosen actions carry canonical intent and capabilities only. | `packages/resilience-runtime/tests/phase-121-127-intelligence.test.ts` |

## Acceptance criteria

1. The model cannot add candidates or promote rejected ones.
2. Timeouts and invalid replies degrade to canonical order.
3. Chosen actions carry canonical intent and capabilities only.

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

# Phase 145 — Compliance & Operational Evidence Framework

## Status

**Implemented pending exact-SHA CI evidence.** Control-to-evidence assessment and sealed bundles are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Map controls to fresh evidence, report gaps and seal verifiable evidence bundles without asserting certification.

## Dependencies

- Phase 143 — Auditability & Immutable Control History
- Phase 144 — Privacy/Security Governance Controls

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/governance/compliance-evidence.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Freshness and failure assessment.
- Gap reports.
- Digest and HMAC bundle sealing.

## Non-goals

- Claiming certification.

## Evidence map

| Criterion | Location |
| --- | --- |
| Missing, stale and failing evidence are distinguished. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |
| Altered bundles fail verification. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |
| Coverage counts only satisfied controls. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |

## Acceptance criteria

1. Missing, stale and failing evidence are distinguished.
2. Altered bundles fail verification.
3. Coverage counts only satisfied controls.

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

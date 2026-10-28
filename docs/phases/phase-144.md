# Phase 144 — Privacy/Security Governance Controls

## Status

**Implemented pending exact-SHA CI evidence.** Executable governance reviews are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Evaluate separation of duties, purpose limitation, stale access, break-glass and least privilege into severity-ranked findings.

## Dependencies

- Phase 108 — Capability Grants & Authorization
- Phase 142 — Data Classification, Retention & Deletion

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/governance/governance-controls.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Conflicting-capability detection.
- Purpose limitation by data class.
- Access review and break-glass checks.

## Non-goals

- Automatic revocation.

## Evidence map

| Criterion | Location |
| --- | --- |
| Critical and high findings fail the review. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |
| Expired grants are ignored. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |
| Findings are deterministic. | `packages/resilience-runtime/tests/phase-141-145-governance.test.ts` |

## Acceptance criteria

1. Critical and high findings fail the review.
2. Expired grants are ignored.
3. Findings are deterministic.

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

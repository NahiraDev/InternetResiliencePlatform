# Phase 131 — Service/Application Policy Enforcement

## Status

**Implemented pending exact-SHA CI evidence.** Per-application path policies with conflict detection are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Evaluate candidate resources against application policies and compile steering rules for permitted choices.

## Dependencies

- Phase 95 — Policy-Based Routing
- Phase 128 — Data-Plane Abstraction & Enforcement

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/dataplane/app-policy.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Kind, trust, cost and failure-domain constraints.
- Pinning and conflict detection.
- Steering rule compilation.

## Non-goals

- Overriding fabric selection authority.

## Evidence map

| Criterion | Location |
| --- | --- |
| Violations carry reasons. | `packages/resilience-runtime/tests/phase-128-134-dataplane.test.ts` |
| Conflicting policies are reported. | `packages/resilience-runtime/tests/phase-128-134-dataplane.test.ts` |
| No permitted resource yields no rule. | `packages/resilience-runtime/tests/phase-128-134-dataplane.test.ts` |

## Acceptance criteria

1. Violations carry reasons.
2. Conflicting policies are reported.
3. No permitted resource yields no rule.

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

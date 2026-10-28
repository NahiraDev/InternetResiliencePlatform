# Phase 133 — Advanced NAT/Firewall Policy Integration

## Status

**Implemented pending exact-SHA CI evidence.** A neutral NAT and firewall model with lockout protection is implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Analyze and evaluate firewall and NAT rule sets and refuse any set that would block protected control-plane flows.

## Dependencies

- Phase 128 — Data-Plane Abstraction & Enforcement

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/dataplane/nat-firewall.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- First-match evaluation failing closed.
- Shadowing and contradiction analysis.
- Protected-flow lockout guard and diffing.

## Non-goals

- Applying rules outside Phase 128 enforcement.

## Evidence map

| Criterion | Location |
| --- | --- |
| Lockout rule sets are refused. | `packages/resilience-runtime/tests/phase-128-134-dataplane.test.ts` |
| Shadowed contradictions are detected. | `packages/resilience-runtime/tests/phase-128-134-dataplane.test.ts` |
| Invalid rules are reported. | `packages/resilience-runtime/tests/phase-128-134-dataplane.test.ts` |

## Acceptance criteria

1. Lockout rule sets are refused.
2. Shadowed contradictions are detected.
3. Invalid rules are reported.

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

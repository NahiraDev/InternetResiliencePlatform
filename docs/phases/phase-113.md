# Phase 113 — Security Monitoring & Automated Response

## Status

**Implemented pending exact-SHA CI evidence.** Detection rules and bounded containment are implemented. This phase remains **PARTIAL** until exact-SHA CI
evidence is recorded; it does not claim live or production-environment validation.

## Objective

Detect control-plane abuse and request audited, rate-limited containment that touches only control-plane trust state.

## Dependencies

- Phase 108 — Device Identity & Enrollment Trust
- Phase 109 — Authorization / Capability Model
- Phase 112 — Security Policy & Runtime Enforcement

## Canonical owner

- `@irp/resilience-runtime` — `packages/resilience-runtime/src/control-security/security-monitoring.ts`
- No new control plane, decision engine, policy engine, event bus, provider registry or transaction executor is
  introduced. Production mutation authority remains with `ResilienceRuntime`.

## Scope

- Windowed detection rules per subject.
- Containment through an injected port with cooldown and budget.
- Audit trail including failures.

## Non-goals

- Network mutation as a response.

## Evidence map

| Criterion | Location |
| --- | --- |
| Thresholds and cooldowns are honoured. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |
| Containment failure is recorded and never throws. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |
| Budget limits containment but not alerts. | `packages/resilience-runtime/tests/phase-107-113-control-security.test.ts` |

## Acceptance criteria

1. Thresholds and cooldowns are honoured.
2. Containment failure is recorded and never throws.
3. Budget limits containment but not alerts.

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

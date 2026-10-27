# Phase 92 — Connectivity Service Assurance

## Status

**Contract formalized (issue #14).** Existing fabric health/freshness attributes, closed-loop verification, safety kernel checkpoints, and observability surfaces provide foundational assurance primitives. Full continuous connectivity service assurance that continuously verifies path health, detects drift from intended connectivity outcomes, and triggers bounded recovery remains **PARTIAL**. Regression evidence for fabric health/freshness signals, observe-only intent drift detection, and re-selection through existing fabric boundaries added. Disposition **PARTIAL** pending exact-SHA CI evidence.

## Objective

Provide continuous, policy-bounded assurance of connectivity services by verifying that selected paths, tunnels, resolvers, and application routes remain healthy and match intended outcomes, using existing fabric, closed-loop, and safety mechanisms without introducing a parallel assurance or verification authority.

## Dependencies

- Phase 86 — Unified Connectivity Fabric
- Phase 91 — Application-Aware Path Selection
- Phase 78 — Closed-Loop Control Foundation
- Phase 77 — Safety, Rollback & Recovery Kernel
- Phase 75 — Decision Orchestration
- Historical Phases 16, 25, 32 (failover, verification, explainability)

## Canonical owner

- `@irp/resilience-runtime` — fabric resource health/freshness, closed-loop verification, safety kernel recovery
- `@irp/telemetry`, `@irp/network-intelligence` — metrics, events, and diagnostics used for assurance signals
- Consumed by the bounded closed-loop controller and existing decision orchestration
- Tests: resilience-runtime closed-loop, fabric, and safety tests; observability package tests

## Scope

- Continuously sample fabric resource health, freshness, and failure-domain status as assurance signals.
- Detect drift between intended connectivity outcomes (from intent/policy) and observed path/service state.
- Route assurance-driven recovery or re-selection requests through the existing safety kernel and decision orchestration; no direct mutations.
- Preserve deterministic stop conditions, cancellation, and local fallback of the closed-loop controller.
- Expose assurance outcomes as auditable events without creating a second control plane.

## Non-goals

- New telemetry pipeline or parallel monitoring system.
- Autonomous unbounded recovery outside the closed-loop maximum cycle bound.
- Production multi-device or regional assurance evidence (issue #4).
- Predictive anomaly models (later Group E phases).

## Evidence map (this change)

| Criterion | Location |
|-----------|----------|
| Fabric health and freshness as assurance signals | `packages/resilience-runtime/tests/phase-92-connectivity-service-assurance.test.ts` |
| Drift detection between intended outcome and observed state (observe-only) | same |
| Re-selection / fail-closed routed through existing fabric.select boundary | same |
| Intent drift detector | `packages/resilience-runtime/src/intent/drift.ts` |
| Fabric health/freshness | `packages/resilience-runtime/src/fabric.ts` |

## Acceptance criteria

1. Fabric snapshots expose health, freshness, and failure-domain attributes usable as assurance inputs.
2. Drift between intended and observed connectivity state is detectable in a deterministic, testable way using existing intent/policy and fabric state.
3. Any recovery or re-selection triggered by assurance is routed through the safety kernel and bounded closed-loop; no parallel execution path.
4. Unit tests covering health signal exposure, drift detection, and safety-boundary routing pass in the owning packages.
5. Architecture guards continue to forbid competing verification, recovery, or control-plane authorities.

## Verification boundary

- Package unit tests for `@irp/resilience-runtime` (fabric, closed-loop, safety) and related observability tests.
- Existing CI that runs those suites.
- No claim of continuous live service assurance or multi-region evidence until device/runtime validation exists.

## Rollback considerations

- Documentation-only until implementation lands.
- Any future assurance feature must be safe-by-default, disableable, and must not weaken closed-loop stop conditions or fabric integrity.

## Related issues

- Tracking: issue #14
- External blockers remain in issue #4

Disposition remains PARTIAL pending exact-SHA CI evidence on the owning package tests.

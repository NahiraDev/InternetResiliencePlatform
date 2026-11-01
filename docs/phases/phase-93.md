# Phase 93 — Advanced Routing Control

## Status

**Contract formalized + foundational regression evidence added.** Existing fabric route selection already ranks by health/cost/trust, filters by freshness, honors preferred failure domains, and fails closed on diversity shortfalls. Regression tests demonstrate these advanced ranking and constraint behaviors remain pure, deterministic, and confined to the existing `fabric.select` boundary. Full policy-driven dynamic optimization and live re-routing under continuous conditions remain **NOT STARTED**. Disposition **PARTIAL** (contract + foundational evidence).

## Objective

Provide policy-bounded advanced routing control that selects, ranks, and re-selects routes using existing fabric, intent, and safety mechanisms without introducing a parallel routing authority or decision engine.

## Dependencies

- Phase 88 — Multi-Path Connectivity Management
- Phase 89 — Gateway Intelligence & Selection
- Phase 90 — DNS / Tunnel / Proxy Orchestration Integration
- Phase 91 — Application-Aware Path Selection
- Phase 92 — Connectivity Service Assurance
- Phase 75 — Decision Orchestration
- Phase 77 — Safety, Rollback & Recovery Kernel

## Canonical owner

- `@irp/resilience-runtime` — fabric route selection, decision orchestration, safety-bounded re-selection
- Consumed by the bounded closed-loop controller
- Tests: resilience-runtime fabric and closed-loop tests

## Scope

- Extend existing fabric route selection with advanced ranking criteria (health, freshness, failure-domain diversity, application affinity, cost/latency proxies) while remaining pure and deterministic.
- Support intent-derived route preferences and constraints without new policy engines.
- Route any re-routing or failover through the existing safety kernel and closed-loop; no direct mutations.
- Preserve fail-closed behavior on stale, low-trust, or insufficiently diverse candidates.
- Expose routing decisions as auditable outcomes.

## Non-goals

- New routing protocol or data-plane implementation.
- Unbounded or continuous background route optimization outside closed-loop bounds.
- Predictive or ML-driven routing (later phases).
- Production multi-region or live traffic engineering evidence.

## Evidence map

| Criterion | Location |
|-----------|----------|
| Advanced route ranking by health/freshness/diversity | `packages/resilience-runtime/tests/phase-93-advanced-routing.test.ts` |
| Intent-constrained route preference (preferredFailureDomains) | same |
| Fail-closed on insufficient candidates / stale | same |
| Re-routing through existing fabric.select boundary | same |

## Acceptance criteria

1. Route selection can rank candidates using multiple fabric attributes without side effects.
2. Intent/policy constraints can influence ranking or filtering deterministically.
3. Insufficient or stale candidates cause fail-closed behavior.
4. Any routing change is routed through existing safety and closed-loop boundaries.
5. Unit tests covering ranking, constraint application, and fail-closed behavior pass.
6. Architecture guards continue to forbid competing routing or decision authorities.

## Verification boundary

- Package unit tests for `@irp/resilience-runtime`.
- Existing CI that runs those suites.
- No claim of live advanced routing or traffic engineering until device/runtime validation exists.

## Rollback considerations

- Documentation-only until implementation lands.
- Any future routing extension must be safe-by-default, disableable, and must not weaken closed-loop stop conditions or fabric integrity.

## Related issues

- Tracking: open roadmap workstream
- External blockers remain in issues #4, #254, #323

Disposition remains PARTIAL pending exact-SHA CI on the owning package tests and full continuous assurance.

# Phase 93 — Advanced Routing Control

## Status

**Contract formalized.** Existing fabric route selection, multi-path intelligence (Phase 88), gateway selection (Phase 89), and closed-loop decision orchestration provide foundational routing primitives. Full advanced routing control that supports policy-driven route optimization, dynamic path preference, and bounded re-routing under changing conditions remains **NOT STARTED**. Disposition **PARTIAL** (contract only).

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

## Evidence map (planned)

| Criterion | Location |
|-----------|----------|
| Advanced route ranking by health/freshness/diversity | `packages/resilience-runtime/tests/phase-93-advanced-routing.test.ts` (to be added) |
| Intent-constrained route preference | same |
| Fail-closed on insufficient candidates | same |
| Re-routing through existing fabric.select / safety boundary | same |

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

Disposition remains PARTIAL (contract only) until regression evidence and exact-SHA CI are present.

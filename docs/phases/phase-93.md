# Phase 93 — Advanced Routing Control

## Status

**Contract formalized (issue #14).** Existing routing primitives, path selection, fabric resources, and decision orchestration provide foundational routing control surfaces. Full advanced routing control (policy-driven multi-path selection, dynamic weight adjustment, and bounded optimization) remains **PARTIAL** / **NOT STARTED** until this contract is accepted, PROJECT_STATE authorizes implementation, and evidence is produced. Disposition **PARTIAL** pending matrix update.

## Objective

Extend the existing connectivity fabric and path selection with advanced, policy-bounded routing control that can dynamically weight, select, and adjust routes based on observed metrics while remaining inside the safety kernel and closed-loop controller. No new routing authority or parallel control plane is introduced.

## Dependencies

- Phase 86 — Unified Connectivity Fabric
- Phase 88 — Multi-Path Connectivity
- Phase 91 — Application-Aware Path Selection
- Phase 82 — Policy Decision & Enforcement Engine
- Phase 84 — Safety Constraints & Change Governance
- Phase 78 — Closed-Loop Control Foundation
- Historical routing and failover primitives (Phases 10, 13, 16)

## Canonical owner

- `@irp/resilience-runtime` — fabric path resources, candidate scoring, and closed-loop application of routing decisions
- `@irp/network-intelligence` — path metrics and destination classification used as inputs
- Consumed by intent translation and the bounded closed-loop controller
- Tests: resilience-runtime fabric/path and decision tests; network-intelligence package tests

## Scope

- Expose tunable path weights and selection criteria as fabric attributes that the existing decision engine can consume.
- Allow policy-driven constraints (latency, cost, reliability, privacy) to influence route scoring without embedding a second policy engine.
- Ensure any route change is admitted through intent governance and the safety kernel before mutation.
- Preserve idempotency and rollback of routing changes via existing transaction and recovery mechanisms.
- Provide structured audit events for route selection and weight adjustments.

## Non-goals

- Autonomous unbounded routing optimization outside the closed-loop cycle limit.
- New global routing protocol or parallel routing table.
- Production multi-site or regional routing evidence (issue #4).
- Full traffic classification or congestion models (Phases 94, 98).

## Acceptance criteria

1. Fabric or path selection surfaces expose weights or scoring inputs that respect existing policy constraints.
2. Route changes produced by advanced control are routed exclusively through the safety kernel and privileged mutation boundary.
3. Rollback of a routing change restores the prior path selection deterministically.
4. Unit tests covering weight application, policy constraint enforcement, and safety-boundary admission pass in the owning packages.
5. Architecture guards continue to forbid competing routing or control-plane authorities.

## Verification boundary

- Package unit tests for `@irp/resilience-runtime` (fabric, path selection, safety) and related network-intelligence tests.
- Existing CI that runs those suites.
- No claim of live advanced routing control or multi-region evidence until device/runtime validation exists.

## Rollback considerations

- Documentation-only until implementation lands.
- Any future routing control feature must be safe-by-default, disableable, and must not weaken closed-loop stop conditions or fabric integrity.

## Related issues

- Tracking: issue #14
- External blockers remain in issue #4

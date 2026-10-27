# Phase 88 — Multi-Path Connectivity Management

## Status

**Contract formalized (issue #14).** Existing path representation in `@irp/routing` and fabric resource kinds (`Route`, `ApplicationPath`) provide a foundation. Full concurrent multi-path establishment, monitoring, and policy-driven path bonding or failover orchestration remain **PARTIAL** / **NOT STARTED** until this contract is accepted, PROJECT_STATE authorizes implementation, and evidence is produced. Disposition **PARTIAL** pending matrix update.

## Objective

Enable deterministic management of multiple concurrent network paths (primary, backup, bonded or policy-selected) with explicit health, capacity and failure-domain awareness, feeding the unified fabric and decision paths while remaining gated by safety and governance.

## Dependencies

- Phase 86 — Unified Connectivity Fabric
- Phase 87 — Multi-Interface Intelligence
- Phase 75 — Decision Orchestration
- Phase 77 — Safety, Rollback & Recovery Kernel
- Existing `@irp/routing` path graph

## Canonical owner

- `@irp/resilience-runtime` — fabric kinds include `Route` and `ApplicationPath`; selection may return diverse paths
- `@irp/routing` — `NetworkPathGraph` and path normalization
- Consumed by decision orchestration and closed-loop verification
- Tests: routing package tests and fabric selection tests

## Scope

- Represent and select among multiple candidate paths with diversity, freshness and capability constraints.
- Provide path health and capacity attributes consumable by the fabric snapshot.
- Support policy hints for path preference without creating a second selection authority.
- Ensure any path activation or traffic steering remains a privileged mutation that passes the safety kernel.

## Non-goals

- Automatic bonding, ECMP or low-level packet-level multi-path without explicit policy and safety approval.
- Parallel path engine outside resilience-runtime and routing.
- Production device multi-path behavioral evidence (issue #4).
- Full application-aware or predictive path selection (later phases).

## Evidence map (this change)

| Criterion | Location |
|-----------|----------|
| Multi-candidate Route selection by health | `packages/resilience-runtime/tests/phase-88-multi-path-regression.test.ts` |
| Stale Route rejection | same |
| Failure-domain diversity fail-closed | same |
| ApplicationPath kind exposure | same |
| Existing fabric selection | `packages/resilience-runtime/src/fabric.ts` (`select`, `selectDiverseResources`) |

## Acceptance criteria

1. Fabric or routing can expose multiple distinct path candidates with required attributes (id, health, failure domains, ownership).
2. Selection can prefer diverse, fresh paths and exclude failed or stale ones deterministically.
3. Path activation requests are routed through existing governance and safety boundaries; no direct mutation from selection.
4. Unit tests covering multi-candidate selection, diversity and stale rejection pass in the owning packages.
5. Architecture guards continue to forbid a competing control-plane or path authority.

## Verification boundary

- Package unit tests for `@irp/resilience-runtime` and `@irp/routing`.
- Existing CI that runs those suites.
- No claim of live multi-path traffic steering evidence until device/runtime validation exists.

## Rollback considerations

- Documentation-only until implementation lands.
- Any future multi-path feature must be safe-by-default and disableable without affecting closed-loop stop conditions.

## Related issues

- Tracking: issue #14
- External blockers remain in issue #4

## Evidence map (Phase 88)

| Criterion | Location |
|-----------|----------|
| Multi-candidate Route selection + diversity | `packages/resilience-runtime/tests/phase-88-multi-path-regression.test.ts` |
| Stale path rejection | same |
| Insufficient diversity fail-closed | same |
| Broader fabric suites | `packages/resilience-runtime/tests/fabric*.test.ts` |

Disposition remains PARTIAL pending exact-SHA CI evidence on the owning package tests.

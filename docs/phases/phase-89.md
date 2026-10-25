# Phase 89 — Gateway Intelligence & Selection

## Status

**Contract formalized (issue #14).** Existing `@irp/gateway-registry` package and `packages/resilience-runtime/src/gateway/gateway-registry-plane.ts` provide registry and plane foundations. Intelligent selection, health-aware ranking, and policy-gated activation remain **PARTIAL** pending exact-SHA CI evidence. Disposition **PARTIAL**.

## Objective

Provide deterministic gateway discovery, inventory, health scoring, and policy-aware selection that feeds the unified connectivity fabric and decision orchestration, without introducing a second selection or control-plane authority.

## Dependencies

- Phase 86 — Unified Connectivity Fabric
- Phase 46–55 historical gateway/tunnel work (registry, discovery, selection)
- Phase 75 — Decision Orchestration
- Phase 77 — Safety, Rollback & Recovery Kernel
- Existing `@irp/gateway-registry` and resilience-runtime gateway plane

## Canonical owner

- `@irp/resilience-runtime` — gateway registry plane and fabric integration for gateway resources
- `@irp/gateway-registry` — inventory, metadata, lifecycle
- Consumed by fabric selection and closed-loop verification
- Tests: gateway-registry package tests and resilience-runtime gateway plane tests

## Scope

- Maintain a canonical, ownership-aware gateway inventory with health, capacity, and freshness attributes.
- Expose gateways as selectable fabric resources with explicit failure domains and capability constraints.
- Support policy hints for gateway preference (latency, region, ownership) without bypassing governance.
- Ensure any gateway activation, tunnel establishment, or traffic steering request passes existing safety and authorization boundaries.

## Non-goals

- Automatic multi-gateway bonding or packet-level load balancing without explicit policy and safety approval.
- Parallel gateway control plane outside resilience-runtime.
- Production regional gateway evidence or signed device validation (issue #4).
- Predictive or ML-driven gateway ranking (later phases).

## Evidence map (this change)

| Criterion | Location |
|-----------|----------|
| Gateway selection by health | `packages/resilience-runtime/tests/phase-89-gateway-regression.test.ts` |
| Stale Gateway rejection | same |
| Failure-domain diversity fail-closed | same |
| Inventory attributes (owner, failure domains, health) | same |
| Existing selectGateway policy/health | `packages/gateway-registry/src/selection.test.ts` |
| Fabric Gateway kind | `packages/resilience-runtime/src/fabric.ts` |

## Acceptance criteria

1. Gateway inventory can be queried with required attributes (id, health, ownership, failure domains, freshness).
2. Selection among candidate gateways is deterministic, excludes stale or failed entries, and respects policy constraints.
3. Gateway activation or tunnel requests are routed through existing governance and safety kernel; no direct mutation from the registry plane.
4. Unit tests covering inventory queries, health filtering, and selection constraints pass in the owning packages.
5. Architecture guards continue to forbid a competing control-plane or gateway authority.

## Verification boundary

- Package unit tests for `@irp/gateway-registry` and `@irp/resilience-runtime`.
- Existing CI that runs those suites.
- No claim of live multi-region gateway selection or tunnel establishment evidence until device/runtime validation exists.

## Rollback considerations

- Documentation-only until implementation lands.
- Any future gateway selection feature must be safe-by-default and disableable without affecting closed-loop stop conditions or fabric integrity.

## Related issues

- Tracking: issue #14
- External blockers remain in issue #4

Disposition remains PARTIAL pending exact-SHA CI evidence on the owning package tests.

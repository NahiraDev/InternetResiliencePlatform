# Phase 91 — Application-Aware Path Selection

## Status

**Contract formalized (issue #14).** Existing fabric resource kinds (ApplicationPath, Service, Endpoint, Destination) and decision orchestration provide foundational surfaces. Full application-aware selection that maps service/application identity to path candidates while respecting policy and safety remains **PARTIAL**. Regression evidence for fabric selection of ApplicationPath/Service/Endpoint kinds added. Disposition **PARTIAL** pending exact-SHA CI evidence.

## Objective

Enable deterministic selection of connectivity paths that are aware of the target application or service identity, using existing fabric resources and decision orchestration, without introducing a parallel path-selection authority.

## Dependencies

- Phase 86 — Unified Connectivity Fabric
- Phase 90 — DNS / Tunnel / Proxy Orchestration Integration
- Phase 75 — Decision Orchestration
- Phase 77 — Safety, Rollback & Recovery Kernel
- Historical Phases 10, 13, 17, 24, 25 (routing, path selection, service profiles, destination classification, verification)

## Canonical owner

- `@irp/resilience-runtime` — fabric ApplicationPath / Service / Endpoint resources and decision orchestration
- `@irp/routing`, `@irp/network-intelligence` — path graphs and destination/service classification
- Consumed by closed-loop verification and safety kernel
- Tests: resilience-runtime fabric and decision-orchestration tests; routing package tests

## Scope

- Represent application/service identity as first-class fabric resources with health, capability, and freshness attributes.
- Allow decision orchestration to request path selection constrained by application/service identity, policy hints, and failure domains.
- Ensure any path mutation or steering request is routed through existing safety and authorization boundaries; no direct side effects from selection.
- Preserve deterministic fallback and closed-loop stop conditions.

## Non-goals

- Deep packet inspection or application-layer payload inspection.
- New routing protocol or parallel path engine outside resilience-runtime.
- Production device or regional evidence of application-specific steering (issue #4).
- Predictive or ML-driven application path ranking (later phases).

## Evidence map (this change)

| Criterion | Location |
|-----------|----------|
| ApplicationPath/Service/Endpoint selection by health | `packages/resilience-runtime/tests/phase-91-application-aware-path-regression.test.ts` |
| Stale resource rejection | same |
| Failure-domain diversity fail-closed | same |
| Inventory attributes (owner, failure domains, application metadata) | same |
| Fabric ApplicationPath/Service/Endpoint kinds | `packages/resilience-runtime/src/fabric.ts` |

## Acceptance criteria

1. Application, service, and endpoint candidates appear in fabric snapshots with required attributes (id, health, capability, ownership, failure domains).
2. Path selection constrained by application/service identity is deterministic and excludes stale or failed candidates.
3. Any steering or mutation request is routed through existing governance and safety kernel; no direct mutation from the fabric plane.
4. Unit tests covering resource exposure, identity-constrained selection, and safety boundaries pass in the owning packages.
5. Architecture guards continue to forbid a competing control-plane or path-selection authority.

## Verification boundary

- Package unit tests for `@irp/resilience-runtime` and `@irp/routing`.
- Existing CI that runs those suites.
- No claim of live application-aware path steering or multi-region evidence until device/runtime validation exists.

## Rollback considerations

- Documentation-only until implementation lands.
- Any future application-aware selection feature must be safe-by-default and disableable without affecting closed-loop stop conditions or fabric integrity.

## Related issues

- Tracking: issue #14
- External blockers remain in issue #4

Disposition remains PARTIAL pending exact-SHA CI evidence on the owning package tests.

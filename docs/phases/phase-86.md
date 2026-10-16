# Phase 86 — Unified Connectivity Fabric

## Status

**Contract formalized (issue #14).** Maps the existing programmable connectivity fabric already present on `main` in `@irp/resilience-runtime`. Disposition remains **PARTIAL** until CI evidence is recorded against this contract and the phase matrix is updated from evidence only. Net-new fabric features remain unauthorized until this contract is accepted and PROJECT_STATE authorizes implementation.

## Objective

Formalize the single canonical connectivity fabric that unifies discovery, health, lifecycle, capability authorization, and selection of network resources (interfaces, gateways, tunnels, resolvers, routes, etc.). All path and multi-interface decisions must consume this fabric rather than inventing parallel resource registries or selection authorities.

## Dependencies

- Phase 73 — Unified Network State Model
- Phase 75 — Decision Orchestration
- Phase 77 — Safety, Rollback & Recovery Kernel
- Phase 78 — Closed-Loop Control Foundation
- Phase 84 — Safety Constraints & Change Governance
- Phase 85 — Intent Assurance & Drift Management

## Canonical owner

- `@irp/resilience-runtime` — `src/fabric.ts` (`ProgrammableConnectivityFabric`, `FabricResource`, `FabricResourceKind`, `FabricResourceState`)
- `src/fabric-lifecycle.ts` (state transitions, freshness, diverse selection, `SELECTABLE_FABRIC_STATES`)
- `src/fabric-authority.ts` (`FabricCapabilityAuthority`, capability decisions with scope/trust/safety/platform checks)
- Consumed by decision orchestration, closed-loop, and any future multi-path or application-aware selection
- Tests: `packages/resilience-runtime/tests/fabric.test.ts`, `fabric-275.test.ts`, `fabric-production-wiring.test.ts`

## Scope

- Maintain a single in-memory (or adapter-backed) resource graph of fabric resources with deterministic kinds, states, health, trust, capacity, cost, failure domains, and lifecycle.
- Enforce legal state transitions and freshness windows; only `HEALTHY` and `DEGRADED` resources are selectable by default.
- Authorize every capability use through `FabricCapabilityAuthority` (scope match, platform, minimum trust, safety ceiling, runtime-authority preference).
- Support diverse selection that respects failure domains.
- Emit structured discovery and selection evidence consumable by the closed-loop and audit surfaces.
- Preserve the invariant that the fabric never itself applies privileged mutations; selection results feed the existing decision → safety → execution path.

## Non-goals

- A second resource registry, path graph, or capability authority outside `@irp/resilience-runtime`.
- Automatic multi-path bonding or traffic engineering (later phases).
- Device-level or regional fabric evidence (issue #4).
- Direct data-plane enforcement.

## Acceptance criteria

1. `ProgrammableConnectivityFabric` accepts discovery providers, stores resources of the declared kinds, and rejects illegal state transitions.
2. Freshness evaluation and `SELECTABLE_FABRIC_STATES` correctly exclude recovering/restricted resources from selection.
3. `FabricCapabilityAuthority` returns a deterministic `CapabilityDecision` that denies mismatched scope, insufficient trust, or safety violations.
4. Diverse selection prefers resources in distinct failure domains when available.
5. Unit tests covering registration, illegal transitions, freshness, capability denial, and diverse selection pass in the owning package.
6. No new selection or mutation path bypasses the fabric authority or the safety kernel.

## Verification boundary

- Package unit tests for `@irp/resilience-runtime` (fabric suites).
- CI workflows that already execute the resilience-runtime test suite (CI, Runtime Lab).
- Architecture guards that forbid a second control-plane or resource authority.
- Explicit non-claim of production certification or live multi-interface evidence.

## Rollback considerations

- Contract is documentation only; no runtime behavior change.
- If later implementation diverges, revert the phase document and restore previous matrix disposition.

## Related issues

- Tracking: issue #14
- External blockers remain in issue #4

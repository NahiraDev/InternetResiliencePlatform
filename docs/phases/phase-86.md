# Phase 86 — Unified Connectivity Fabric

## Status

**Contract formalized (issue #14).** Maps existing fabric capability authority, resource model, lifecycle and selection primitives already present on `main` in `@irp/resilience-runtime`. Disposition remains **PARTIAL** until CI evidence is recorded against this contract and the phase matrix is updated from evidence only. Net-new fabric orchestration workflows remain unauthorized until this contract is accepted and PROJECT_STATE is updated.

## Objective

Formalize a single, authoritative connectivity fabric that unifies device, interface, link, provider, gateway, route, resolver, tunnel, transport, proxy, egress and related resources under enforceable capability, scope, trust, safety and platform constraints. The fabric is the canonical source of selectable connectivity resources; selection and mutation paths must consult it rather than invent parallel inventories.

## Dependencies

- Phase 46 — Authorized Gateway Inventory
- Phase 47 — Gateway Discovery, Health and Stale Handling
- Phase 48 — Provider-Neutral Tunnel Lifecycle
- Phase 77 — Safety, Rollback & Recovery Kernel
- Phase 78 — Closed-Loop Control Foundation
- Phase 84 — Safety Constraints & Change Governance

## Canonical owner

- `@irp/resilience-runtime` — `src/fabric.ts` (resource kinds, states, capability model), `src/fabric-authority.ts` (`FabricCapabilityAuthority`, authorize), `src/fabric-lifecycle.ts` (freshness, diverse selection, state transitions)
- Consumed by gateway registry, tunnel, connectivity and decision packages
- Tests: `packages/resilience-runtime/tests/` (fabric suites)

## Scope

- Maintain a typed inventory of fabric resources with declared kinds, states and lifecycle transitions.
- Enforce capability authorization: a caller may use a capability only when scope, platform, trust and safety ceilings match.
- Provide freshness evaluation and diverse resource selection that prefer healthy, recent, non-stale entries.
- Preserve the invariant that the fabric registry is the single place that answers “may this actor use this capability for this resource”.
- Feed selected resources into existing decision, policy and safety paths; never bypass them.

## Non-goals

- A second connectivity inventory or competing fabric authority outside `@irp/resilience-runtime`.
- Automatic mutation of host networking solely from fabric selection.
- Full multi-path or application-aware orchestration (Phases 88, 91).
- Production device or regional fabric evidence (issue #4).

## Acceptance criteria

1. `FabricCapabilityAuthority.authorize` correctly allows or denies a `CapabilityRequest` based on scope, platform, trust and safety, returning structured reasons.
2. Fabric resource state transitions are validated; invalid transitions are rejected.
3. Freshness and diverse-selection helpers prefer non-stale, healthy resources and return deterministic partitions.
4. Unit tests covering authorization matrix, state transitions and freshness/selection pass in the owning package.
5. No new selection or mutation path is introduced that bypasses the fabric authority or the safety kernel.

## Verification boundary

- Local package tests for `@irp/resilience-runtime`.
- CI workflows that already execute the resilience-runtime test suite.
- Architecture guards that forbid a second control-plane or fabric authority.
- Explicit non-claim of production certification or live device fabric evidence.

## Rollback considerations

- Contract is documentation only; no runtime behavior change.
- If later implementation diverges, revert the phase document and restore previous matrix disposition.

## Related issues

- Tracking: issue #14

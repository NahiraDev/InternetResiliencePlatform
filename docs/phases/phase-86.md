# Phase 86 — Unified Connectivity Fabric

## Status

**Contract formalized (issue #14).** Existing fabric resource model, lifecycle, capability authority and selection logic in `@irp/resilience-runtime` map to the unified fabric. Full multi-interface / multi-path orchestration and live assurance remain **PARTIAL** / **NOT STARTED** until this contract is accepted, PROJECT_STATE authorizes further implementation, and evidence is produced. Disposition **PARTIAL** pending matrix update.

## Objective

Establish a single canonical connectivity fabric that represents devices, interfaces, links, providers, gateways, routes, tunnels, transports and related resources with uniform lifecycle, health, trust, capacity and capability authority. All path selection and recovery decisions must consult the fabric rather than ad-hoc resource lists.

## Dependencies

- Phase 73 — Unified Network State Model
- Phase 74 — Control-Plane Contracts
- Phase 75 — Decision Orchestration
- Phase 77 — Safety, Rollback & Recovery Kernel
- Phase 78 — Closed-Loop Control Foundation

## Canonical owner

- `@irp/resilience-runtime` — `src/fabric.ts` (`FabricResource`, `FABRIC_RESOURCE_KINDS`, resource model)
- `src/fabric-lifecycle.ts` (state transitions, freshness, diverse selection)
- `src/fabric-authority.ts` (`FabricCapabilityAuthority`, capability decisions)
- Consumed by decision orchestration, closed-loop controller and path selection
- Tests: `packages/resilience-runtime/tests/fabric*.test.ts`

## Scope

- Represent all connectivity resources under a uniform `FabricResource` model with kind, state, health, confidence, trust, capacity, cost and ownership.
- Enforce deterministic lifecycle state transitions and freshness evaluation.
- Provide a capability authority that answers whether an actor may use a given capability on a resource under scope, platform, trust and safety constraints.
- Support diverse resource selection that prefers healthy, fresh, high-trust candidates.
- Preserve the invariant that fabric state is observed/derived; mutation of underlying network resources still flows through the privileged execution boundary and safety kernel.

## Non-goals

- Direct mutation of host networking or external providers from the fabric layer.
- A second fabric store or parallel capability registry outside `@irp/resilience-runtime`.
- Live multi-path or multi-interface runtime evidence on real devices (issue #4).
- Application-aware or predictive selection (later phases 91+).

## Acceptance criteria

1. `FabricResource` and related types cover the declared resource kinds and states; construction and serialization are deterministic.
2. Lifecycle helpers reject illegal state transitions and correctly partition resources by freshness.
3. `FabricCapabilityAuthority` returns deterministic allow/deny decisions with reasons for scope, platform, trust and safety mismatches.
4. Diverse selection prefers healthy/fresh resources and respects capacity/cost constraints when supplied.
5. Unit tests in the owning package cover resource model, lifecycle transitions, capability decisions and selection; architecture guards continue to forbid a competing control plane.

## Verification boundary

- Package unit tests for `@irp/resilience-runtime` fabric modules.
- Existing CI that runs resilience-runtime tests.
- No claim of live network fabric evidence until device/runtime validation exists.

## Rollback considerations

- Documentation-only until further implementation lands.
- Any new fabric mutation surface must remain behind the existing safety kernel and privileged boundary so it can be disabled without affecting closed-loop stop conditions.

## Related issues

- Tracking: issue #14

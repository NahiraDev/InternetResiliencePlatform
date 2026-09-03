# Canonical Control-Plane Ownership Contract

## Status

Phase 72 architecture contract. This document is normative for Phases 72–78 unless a later phase explicitly supersedes one of its boundaries.

## Canonical authority

`@irp/resilience-runtime` is the transport-agnostic orchestration authority for the network-control loop. It coordinates the lifecycle from normalized observations through decision, policy admission, planning, execution, verification and recovery.

This does **not** make every intelligence, state, provider or telemetry object a runtime-owned implementation. Ownership is separated by semantic responsibility below.

## Ownership map

| Capability | Canonical owner | Allowed responsibility | Explicit non-ownership |
|---|---|---|---|
| Observation | Resilience Runtime observation boundary + domain observation providers | Collect and normalize evidence | Must not mutate network state or authorize changes. |
| Network intelligence | `@irp/network-intelligence` | Measurements, models, scoring and decision inputs | Must not become an independent mutation/orchestration authority. |
| Control-loop orchestration | `@irp/resilience-runtime` | Sequence lifecycle stages and coordinate contracts | Must not duplicate domain provider registries. |
| Runtime lifecycle | `RuntimeStateMachine` | Runtime lifecycle state (`idle`, `observing`, `planning`, etc.) | Not a replacement for Phase 73 desired/observed/actual network state. |
| Network state semantics | Phase 73 state contract in `@irp/resilience-runtime` | Cross-domain desired/observed/actual envelope and reconciliation semantics | Not a generic database or replacement for domain stores. |
| Decision composition | Runtime decision/autopilot boundary | Combine admitted intelligence inputs into an actionable decision | Intelligence packages remain providers/inputs unless a later contract explicitly changes authority. |
| Policy and safety | Existing runtime policy + security/capability authorization | Admit, constrain or reject proposed changes | No second policy engine. |
| Planning | `packages/resilience-runtime/src/planning/` | Produce bounded plans from admitted decisions | Must not apply host mutations. |
| Execution | Runtime execution boundary + domain adapters | Apply authorized actions and report outcomes | Adapters do not independently bypass policy/authorization. |
| Verification / assurance | Runtime verification/validation + telemetry evidence | Verify requested outcomes and correlate evidence | Must not silently authorize a new mutation. |
| Recovery / rollback | Runtime recovery + domain failover primitives | Compensate or recover failed/unsafe changes | Must not create a parallel control loop. |
| Shared events | `@irp/events` for cross-package domain/integration contracts | Versioned shared event types and transport-neutral event contracts | Local implementation events remain local and are not automatically public contracts. |
| Domain registries | DNS, gateway, tunnel, connectivity and plugin packages | Own their domain inventory/provider lifecycle | No generic registry may absorb unrelated domain ownership. |
| API | Versioned Product/Control API | Authenticate, authorize and expose stable capabilities | API/UI layers do not own network-control decisions. |
| Clients | Linux/macOS/Windows/mobile clients and native adapters | Presentation, lifecycle integration and permitted platform operations | No client-side source of truth for routing, policy, gateway selection or failover. |
| Telemetry | Existing telemetry/metrics/observability packages | Metrics, traces, events and evidence | No independent health calculation that becomes a competing control authority. |

## Control-loop boundary

```text
Observation providers
        |
        v
Normalize / correlate evidence
        |
        v
@irp/resilience-runtime orchestration
        |
        +--> network-intelligence inputs
        |
        v
Decision composition
        |
        v
Policy + capability + safety admission
        |
        v
Planning
        |
        v
Execution adapters
        |
        v
Verification / assurance
        |
        +---- success ----> telemetry / state update
        |
        +---- failure ----> rollback / recovery ----> verification
```

Every network mutation must pass through the policy, capability, safety and execution boundaries. Simulation and observation paths remain non-mutating.

## State authority boundary

Phase 73 defines the cross-domain semantic relationship between desired, observed and actual state. It does not replace `RuntimeStateMachine`, network-intelligence snapshots, or domain-specific stores.

- `desired` represents admitted intent/configuration the control plane intends to establish.
- `observed` represents evidence from observation providers.
- `actual` represents the applied state reported by the execution boundary.
- Domain stores remain authoritative for their own persistence and provider-specific data.

## Event authority boundary

Shared events crossing package boundaries belong in `@irp/events` or an explicitly versioned contract layer. Runtime-local events remain implementation details unless promoted into a shared contract.

Phase 74 owns the concrete event taxonomy/versioned payloads. Phase 72 establishes only the ownership rule so event definitions do not proliferate across runtime and intelligence packages.

## Dependency contract for Phases 73–78

```text
72 Ownership
   |
   +--> 73 State semantics
   |       |
   |       v
   +--> 74 Shared contracts/events
   |       |
   |       v
   +--> 75 Decision composition
   |       |
   |       v
   +--> 76 Action transactions
   |       |
   |       v
   +--> 77 Safety / rollback / recovery
   |       |
   |       v
   +--> 78 Bounded closed loop
```

A later phase may extend a boundary, but it must not introduce a competing authority for the same semantic responsibility.

## Prohibited duplicate authorities

The following are prohibited unless an explicit architecture decision supersedes this contract:

- second global control-plane runtime;
- second global network-state registry/store;
- second policy/safety engine;
- second cross-domain event bus or event taxonomy;
- second generic provider registry;
- second transaction executor/control loop;
- client-side autonomous routing/policy authority.

## Change rule

Changes to canonical ownership require an explicit architecture/contract decision, affected-phase analysis, compatibility review and verification evidence. Merely adding a new implementation is not sufficient to transfer authority.

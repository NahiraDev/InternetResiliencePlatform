# Control-Plane Execution Baseline — 2026-09-03

## Status

Architecture audit baseline. This document records repository evidence and identifies the boundaries that must be resolved before implementation of Phase 72–78. It does not certify any future phase.

## Audit scope

This audit starts from `main` commit `a2bd55e2df35097531a64ce879772dd03290a99d` and compares the existing implementation and canonical documentation with `docs/roadmap/MASTER_ROADMAP_V2.md`.

The audit covers:

- repository and agent coordination contracts;
- existing control-plane, runtime, intelligence, policy, execution, assurance and recovery components;
- API and client boundaries;
- state/event/decision ownership;
- Phase 71 release-gate dependency;
- Phase 72–78 execution prerequisites.

This is a static repository audit. It does not claim a fresh local execution of `pnpm validate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, or `pnpm build`. CI evidence must continue to be taken from GitHub Actions.

## Verified starting facts

1. Phase 71 implementation is present, but its phase record explicitly requires a real tagged GitHub Release and inspection of published assets before certification.
2. `docs/roadmap/MASTER_ROADMAP_V2.md` defines the post-v1 target architecture through Phase 150.
3. `PROJECT_STATE.md` and several navigation/governance documents still describe the 70-phase roadmap as current. They must be reconciled so contributors and AI agents do not receive conflicting authority.
4. Existing control-plane behavior is materially present; Phase 72 is therefore an ownership/reconciliation phase, not a greenfield control-plane build.

## Existing implementation ownership map

| Capability | Existing implementation evidence | Baseline assessment |
| --- | --- | --- |
| Observation / measurements | `packages/resilience-runtime/src/observation-providers.ts`, `src/observations/`; `packages/network-intelligence/src/core/NetworkMonitor.ts`, `NetworkSampler.ts`, providers and metrics | Implemented in multiple layers; canonical boundary must be explicit. |
| Network state | `packages/resilience-runtime/src/domain/types.ts`, `src/state/state-machine.ts`, `src/stores/`; `packages/network-intelligence/src/models/NetworkSnapshot.ts`, `QualityScore.ts` | Strong existing state models, but ownership is distributed. |
| Decisioning | `packages/resilience-runtime/src/canonical-decision-provider.ts`, `src/decisions/`; `packages/network-intelligence/src/decision/NetworkDecisionEngine.ts`, `DecisionEvaluator.ts`, `InternetIntelligenceBridge.ts` | Multiple decision-related components exist; Phase 72 must establish one authoritative decision boundary. |
| Planning | `packages/resilience-runtime/src/planning/planner.ts` | Existing bounded planning capability. |
| Policy / safety | `packages/resilience-runtime/src/policy/policy.ts`; `packages/security`; API authorization/capability contracts | Existing policy/security controls; must be composed rather than duplicated. |
| Execution | `packages/resilience-runtime/src/execution/execution.ts`, `canonical-network-adapter.ts`, adapter registry; routing/connectivity/tunnel packages | Existing execution adapters and privileged boundaries. No single cross-domain transaction envelope is evident from the current package layout. |
| Verification / assurance | `packages/resilience-runtime/src/verification/`, `validation/`, `telemetry/`, federation; `packages/telemetry` | Existing assurance mechanisms; cross-plane correlation needs canonicalization. |
| Recovery | `packages/resilience-runtime/src/recovery/`, `packages/failover`, gateway-registry failover support | Existing recovery and failover logic; ownership and rollback semantics need one authoritative contract. |
| Events | `packages/events`; `packages/resilience-runtime/src/events`; `packages/network-intelligence/src/events` | Potential event-contract duplication. A canonical event taxonomy/bus boundary is required before Phase 74/78. |
| API / control surface | `apps/api/src/unified-product-api.ts`, `apps/api/src/index.ts`, `packages/sdk`; `docs/api/control-plane-contract.md` | Existing versioned product/control API and capability model. |
| Clients | Linux/macOS/Windows packages; Android/iOS full clients; native adapters | Clients already consume control-plane capabilities. Their authority boundary must remain non-decision-making. |
| Provider abstraction | gateway-registry, tunnel, connectivity, DNS and plugin packages | Multiple provider registries are intentional domain boundaries, but Phase 72 must prevent cross-domain duplication. |
| Telemetry | `packages/telemetry`, `packages/metrics`, runtime telemetry and observability workflows | Substantial telemetry exists; unified control-plane correlation remains a later concern. |

## Critical architectural findings

### 1. Decision authority is distributed

There is a real control loop today, but decision-related behavior exists in both `@irp/resilience-runtime` and `@irp/network-intelligence`. This is not automatically a bug: one can be the domain intelligence provider and the other the orchestration authority. The distinction is not sufficiently explicit in one canonical contract.

**Required Phase 72 outcome:** define which component owns authoritative decision orchestration, which components are decision inputs/providers, and which components are forbidden from directly mutating network state.

### 2. State models are distributed

`@irp/resilience-runtime` contains control-loop/domain state while `@irp/network-intelligence` contains network snapshots and quality models. Phase 73 must establish how desired, observed and actual state relate without forcing every subsystem into a single monolithic object.

### 3. Event contracts have multiple homes

The repository contains an events package plus runtime-local and intelligence-local event definitions. Phase 74 must distinguish shared domain events, runtime-local events and transport/integration events, and define ownership/versioning rules.

### 4. Execution has adapters, but transaction semantics are not yet a single cross-domain contract

The repository already contains planning, execution, adapter capability checks, validation, verification and recovery. Phase 76 must add or formalize a single transaction/change envelope across those primitives rather than creating a second execution engine.

### 5. Safety and recovery exist but need one explicit kernel contract

Policy, capability authorization, validation, verification and rollback/recovery are already represented. Phase 77 must compose those mechanisms into a canonical safety/rollback boundary with checkpoints, idempotency, blast-radius limits and recovery semantics.

### 6. Closed-loop behavior exists but is not yet the full unified control-plane contract

`@irp/resilience-runtime` contains observation, planning, policy, execution, verification, telemetry and recovery components. Phase 78 should formalize the end-to-end state machine and bounded loop across the existing components rather than duplicating the runtime.

## Phase 72–78 readiness matrix

| Phase | Baseline | Principal gap | Required output |
| ---: | --- | --- | --- |
| 72 | Partial / architecture-ready | Canonical ownership is distributed across existing components and documents | One authoritative ownership/boundary map and dependency contract |
| 73 | Partial | No single documented desired/observed/actual state model spanning the relevant domains | Canonical state semantics and reconciliation rules |
| 74 | Partial | Multiple event/contract homes exist | Versioned cross-layer contracts and event taxonomy |
| 75 | Partial | Decision inputs and orchestration are both present but ownership is not fully normalized | Deterministic decision composition boundary |
| 76 | Partial | Execution primitives exist without one explicit cross-domain transaction contract | Idempotent transaction/action envelope and lifecycle |
| 77 | Partial | Safety, validation, verification and recovery are present in separate components | Unified safety/rollback/recovery kernel contract |
| 78 | Partial | Observe/decide/apply/verify/recover behavior exists in runtime components | Bounded closed-loop orchestration over canonical contracts |

`Partial` here means existing implementation evidence covers significant pieces, but the target phase contract requires integration/ownership work. It does not mean the phase is complete.

## Phase 79–150 planning disposition

No claim of implementation status is made for Phases 79–150 by this audit. They remain target architecture in `MASTER_ROADMAP_V2.md` and must be mapped against implementation only after the Phase 72–78 contracts are stabilized.

The dependency rule is intentional: intent/policy, safety, telemetry and authoritative control contracts must precede broad autonomy, AI assistance, fleet control, data-plane enforcement and production-scale distributed control.

## Phase 71 gate dependency

Phase 72 may be prepared architecturally, but implementation-phase completion must not be treated as superseding the Phase 71 external release-certification requirement. The project should keep two concepts separate:

- **architecture preparation:** documentation, ownership mapping and contract design;
- **phase execution/completion:** implementation plus required verification and evidence.

## Coordination rules for multiple agents

1. One phase owner per active phase.
2. One agent may own a file/package at a time.
3. Shared contract changes require integration review before dependent implementation proceeds.
4. Do not create a second decision engine, state registry, policy engine, event bus, provider registry or transaction executor when an existing canonical component can be extended.
5. Each phase implementation uses a dedicated `phase/<number>-<short-name>` branch.
6. Each phase must record affected packages, contracts, tests, acceptance criteria and rollback considerations.
7. A phase is not complete from source presence alone; CI/runtime evidence remains mandatory where applicable.

## Recommended execution order

```text
Phase 71 external release certification
                |
                v
      Phase 72 ownership baseline
                |
                v
       Phase 73 canonical state
                |
                v
      Phase 74 contracts/events
                |
                v
      Phase 75 decision orchestration
                |
                v
      Phase 76 action transactions
                |
                v
       Phase 77 safety/recovery
                |
                v
       Phase 78 closed-loop control
                |
                v
        Phase 79+ intent/policy
```

The arrow represents a dependency direction, not a prohibition on all parallel work. Work may proceed in parallel only where contracts are already stable and ownership is disjoint.

## Conclusion

The repository is not missing a greenfield control plane. It already contains substantial control-plane/runtime capabilities. The immediate architectural risk is **fragmented authority**, not lack of features.

Therefore the next implementation effort should consolidate and formalize the existing components before adding more autonomous functionality. This baseline is the reference point for Phase 72 and for future AI/developer handoffs.

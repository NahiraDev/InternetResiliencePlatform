# Phase 72 Downstream Integration Contract

This document records the integration boundary established by Phase 72 for Phases 73–78. It is a coordination contract, not an implementation claim for those phases.

## Integration matrix

| Phase | Depends on Phase 72 for | Owns | Must not own |
|---|---|---|---|
| 73 — Unified Network State Model | desired/observed/actual semantic ownership and runtime lifecycle separation | canonical state envelope and reconciliation semantics | a second runtime lifecycle/state authority |
| 74 — Control-Plane Contracts | cross-package event ownership and versioning boundary | typed cross-layer contracts/events | an independent event bus/taxonomy competing with shared contracts |
| 75 — Decision Orchestration | decision authority and intelligence-provider boundary | deterministic decision composition | direct autonomous mutation or a second control loop |
| 76 — Action Transaction Engine | planning/execution authority and adapter boundary | action/transaction lifecycle, idempotency and ordering | a replacement execution adapter framework |
| 77 — Safety, Rollback & Recovery Kernel | policy, authorization, verification and recovery ownership | unified safety/checkpoint/rollback contract | a second policy engine or recovery control loop |
| 78 — Closed-Loop Control Foundation | all preceding authority boundaries | bounded observe → decide → apply → verify/recover orchestration | a second global runtime/control plane |

## Required cross-phase invariants

1. **Single orchestration authority:** `@irp/resilience-runtime` remains the canonical network-control orchestration boundary.
2. **Intelligence is input:** `@irp/network-intelligence` may measure, model, score and recommend, but does not independently mutate network state.
3. **State is semantic, not monolithic:** Phase 73's desired/observed/actual model does not replace runtime lifecycle state or domain-specific persistence.
4. **Events are versioned contracts:** Phase 74 owns concrete shared event contracts; local events remain local until explicitly promoted.
5. **Policy precedes execution:** no Phase 75/76 feature may bypass existing authorization, capability, policy or safety checks.
6. **Execution is bounded:** Phase 76 actions must be idempotent where applicable, observable, attributable and compatible with rollback/recovery.
7. **Recovery is compensating, not competing:** Phase 77 recovery must return control to the canonical runtime rather than start a parallel control loop.
8. **Closed loop is bounded:** Phase 78 must preserve fail-closed behavior, deterministic fallback and explicit verification before accepting a mutation as successful.
9. **Clients remain adapters:** platform clients consume canonical capabilities and may expose permitted native operations, but do not become policy/routing authorities.
10. **Domain registries remain domain-specific:** gateway, tunnel, connectivity, DNS and plugin registries are not merged into a generic registry by downstream phases.

## Contract handoff rules

### Phase 73 → Phase 74

Phase 74 consumes the state semantics from Phase 73 but does not redefine desired/observed/actual ownership. Event payloads referring to network state must identify the applicable state layer and provenance.

### Phase 74 → Phase 75

Decision events and contract payloads must identify the decision source and correlation context without granting the producer mutation authority. Decision orchestration remains in the runtime boundary.

### Phase 75 → Phase 76

A decision becomes executable only after policy/capability admission. Phase 76 must receive an explicitly authorized action/plan rather than an unrestricted intelligence recommendation.

### Phase 76 → Phase 77

Transaction/action execution must expose enough identity, ordering, idempotency and checkpoint context for safety and recovery to reason about compensation without duplicating execution.

### Phase 77 → Phase 78

The closed loop may apply a change only after safety admission and must not treat an unverified result as success. Recovery must be selected through the same authoritative orchestration boundary.

## Parallel-work rule

Implementation may proceed in parallel only when file/package ownership is disjoint and these contracts remain stable. If a downstream implementation requires changing an ownership boundary, stop the dependent change and record an explicit integration/architecture decision first.

## Evidence rule

A phase is complete only when its implementation, tests, repository gates and required CI/runtime evidence satisfy its own phase record. This document does not certify Phases 73–78.

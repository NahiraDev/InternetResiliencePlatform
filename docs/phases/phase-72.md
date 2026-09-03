# Phase 72 — Control-Plane Architecture Completion

## Status

Architecture preparation / coordination baseline. **Implementation completion is gated by the Phase 71 external release-certification requirement.** This phase may define contracts and ownership while Phase 71 evidence remains pending, but it must not claim Phase 71 completion.

## Objective

Establish the canonical architectural boundary for IRP's unified Internet Control Plane before introducing new autonomous behavior.

## Repository baseline

The execution baseline is documented in [`../audits/control-plane-execution-baseline-2026-09-03.md`](../audits/control-plane-execution-baseline-2026-09-03.md). The repository already contains substantial control-plane/runtime primitives; this phase is primarily an ownership, reconciliation and contract-completion phase rather than a greenfield build.

## Existing canonical components

| Layer | Existing evidence | Phase 72 treatment |
| --- | --- | --- |
| Observation | `packages/resilience-runtime/src/observation-providers.ts`, `src/observations/`; `packages/network-intelligence/src/core/` and providers | Reuse and define boundary. |
| State | `packages/resilience-runtime/src/domain/`, `src/state/`, `src/stores/`; network-intelligence models | Define desired/observed/actual semantics without creating a duplicate global state store. |
| Intelligence | `packages/network-intelligence/src/decision/`, `packages/internet-intelligence-agent` | Treat as decision inputs/providers unless the canonical authority contract explicitly assigns orchestration elsewhere. |
| Decision orchestration | `packages/resilience-runtime/src/canonical-decision-provider.ts`, `src/decisions/`, `src/autopilot/` | Establish one authoritative orchestration boundary. |
| Policy / safety | `packages/resilience-runtime/src/policy/`, `packages/security`, API capability/authorization | Compose existing policy and security controls; do not create another policy engine. |
| Planning | `packages/resilience-runtime/src/planning/planner.ts` | Reuse as the planning primitive. |
| Execution | `packages/resilience-runtime/src/execution/`, `canonical-network-adapter.ts`, adapter registry | Formalize transaction/action semantics around the existing execution boundary. |
| Verification / assurance | `src/verification/`, `src/validation/`, `src/telemetry/`, federation and `packages/telemetry` | Normalize assurance correlation without duplicating telemetry pipelines. |
| Recovery | `src/recovery/`, `packages/failover`, gateway-registry failover | Define canonical recovery/rollback ownership and compensation semantics. |
| API | `apps/api/src/unified-product-api.ts`, `packages/sdk`, `docs/api/control-plane-contract.md` | Preserve the existing versioned capability API as the external contract. |
| Clients | Linux/macOS/Windows/mobile clients and native adapters | Keep clients as consumers/adapters; no routing/policy decision authority. |

## Scope

- Define ownership boundaries between observation, state, intelligence, policy, decision, planning, execution, assurance and recovery.
- Identify canonical interfaces between existing packages.
- Identify and resolve documentation-level ambiguity around distributed decision, state and event models.
- Define the control-loop lifecycle and safety boundary.
- Establish integration contracts required by Phases 73–78.
- Record explicit non-ownership rules so parallel contributors cannot introduce duplicate engines or registries.

## Known overlaps to reconcile

1. **Decision:** `network-intelligence` contains decision engines while `resilience-runtime` contains canonical decision/autopilot orchestration. One must be the authority; the other must remain a provider/input layer.
2. **State:** runtime domain/state and network-intelligence snapshots/quality models must have explicit semantic ownership.
3. **Events:** `packages/events`, runtime-local events and network-intelligence events need a documented distinction between shared domain events and local/transport events.
4. **Provider registries:** DNS, gateway, tunnel, connectivity and plugin registries are distinct domain registries; Phase 72 must prevent accidental creation of a generic competing registry.

## Non-goals

- No new autonomous network mutations.
- No replacement of existing DNS, routing, tunnel, gateway or connectivity implementations.
- No AI-driven network control.
- No destructive migration of existing state.
- No new client-side routing or policy engine.
- No creation of a second control-plane runtime package merely to satisfy the roadmap wording.

## Dependencies

- Phase 71 implementation and required external release-certification evidence.
- Existing Phase 0–71 implementation and documentation.
- `docs/roadmap/MASTER_ROADMAP_V2.md`.
- `docs/api/control-plane-contract.md`.
- `docs/architecture/live-control-plane.md`.
- `docs/architecture/platform-model.md`.
- `docs/audits/control-plane-execution-baseline-2026-09-03.md`.

## Required outputs

1. Canonical control-plane ownership map.
2. Explicit desired/observed/actual state semantics and ownership handoff to Phase 73.
3. Explicit decision-authority boundary for intelligence versus orchestration.
4. Event ownership/versioning boundary for Phase 74.
5. Integration dependency record for Phases 73–78.
6. Updated contributor/agent guidance so the current roadmap cannot be confused with the historical 70-phase baseline.

## Verification

This phase is documentation/contract work only unless a separately approved implementation change is required by the acceptance criteria.

Required checks before phase completion:

- repository validation;
- documentation validation and internal-link checks;
- architecture/API consistency review;
- confirmation that no duplicate decision/state/policy/event/control engine was introduced;
- GitHub CI green for the resulting branch/PR.

Runtime networking behavior must remain unchanged by the architecture-only portion of this phase.

## Rollback

Because the architecture-only portion changes documentation and coordination contracts, rollback is a clean revert of the phase commit(s). Any runtime implementation added later must have its own explicit migration and rollback plan.

## Acceptance Criteria

- Canonical control-plane ownership is documented.
- Existing packages are mapped to the control-plane layers without inventing duplicate owners.
- Decision, state and event overlaps are explicitly identified with a resolution direction.
- Phase 73–78 dependencies and integration boundaries are documented.
- Phase 71 external certification remains visible as a prerequisite and is not falsely marked complete.
- Contributor/agent instructions point to the current roadmap V2 and the current implementation gate.
- No existing runtime behavior changes solely because this architecture phase was documented.
- Repository/documentation validation and the PR CI gates remain green before completion is claimed.

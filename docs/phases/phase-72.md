# Phase 72 — Control-Plane Architecture Completion

## Status

**Architecture contract implemented; phase completion is gated by the Phase 71 external release-certification requirement and Phase 72 verification/CI evidence.** Phase 72 must not be marked certified while Phase 71 remains open.

## Objective

Establish the canonical architectural boundary for IRP's unified Internet Control Plane before introducing new autonomous behavior.

## Repository baseline

The execution baseline is documented in [`../audits/control-plane-execution-baseline-2026-09-03.md`](../audits/control-plane-execution-baseline-2026-09-03.md). The repository already contains substantial control-plane/runtime primitives; this phase is an ownership, reconciliation and contract-completion phase rather than a greenfield build.

## Canonical architecture contract

The normative Phase 72 ownership map is [`../architecture/control-plane-ownership.md`](../architecture/control-plane-ownership.md). The downstream integration contract for Phases 73–78 is [`../architecture/control-plane-phase72-dependencies.md`](../architecture/control-plane-phase72-dependencies.md).

The canonical authority remains `@irp/resilience-runtime`. Existing intelligence, state, policy, execution, assurance, recovery, API and client components retain their domain responsibilities without creating a competing global control plane.

## Existing canonical components

| Layer | Existing evidence | Phase 72 treatment |
| --- | --- | --- |
| Observation | `packages/resilience-runtime/src/observation-providers.ts`, `src/observations/`; `packages/network-intelligence/src/core/` and providers | Reuse and define boundary. |
| State | `packages/resilience-runtime/src/domain/`, `src/state/`, `src/stores/`; network-intelligence models | Phase 73 owns the desired/observed/actual semantic envelope; runtime lifecycle and domain stores remain distinct. |
| Intelligence | `packages/network-intelligence/src/decision/`, `packages/internet-intelligence-agent` | Decision intelligence remains an input/provider layer, not a second mutation authority. |
| Decision orchestration | `packages/resilience-runtime/src/canonical-decision-provider.ts`, `src/decisions/`, `src/autopilot/` | Runtime remains the authoritative orchestration boundary. |
| Policy / safety | `packages/resilience-runtime/src/policy/`, `packages/security`, API capability/authorization | Compose existing policy and security controls; do not create another policy engine. |
| Planning | `packages/resilience-runtime/src/planning/planner.ts` | Reuse as the planning primitive. |
| Execution | `packages/resilience-runtime/src/execution/`, `canonical-network-adapter.ts`, adapter registry | Formalize transaction/action semantics around the existing execution boundary. |
| Verification / assurance | `src/verification/`, `src/validation/`, `src/telemetry/`, federation and `packages/telemetry` | Normalize assurance correlation without duplicating telemetry pipelines. |
| Recovery | `src/recovery/`, `packages/failover`, gateway-registry failover | Canonical recovery/rollback remains within the runtime orchestration boundary. |
| API | `apps/api/src/unified-product-api.ts`, `packages/sdk`, `docs/api/control-plane-contract.md` | Preserve the existing versioned capability API as the external contract. |
| Clients | Linux/macOS/Windows/mobile clients and native adapters | Keep clients as consumers/adapters; no routing/policy decision authority. |

## Scope

- Define ownership boundaries between observation, state, intelligence, policy, decision, planning, execution, assurance and recovery.
- Identify canonical interfaces between existing packages.
- Resolve documentation-level ambiguity around distributed decision, state and event models.
- Define the control-loop lifecycle and safety boundary.
- Establish integration contracts required by Phases 73–78.
- Record explicit non-ownership rules so parallel contributors cannot introduce duplicate engines or registries.

## Resolved overlaps

1. **Decision:** `@irp/network-intelligence` supplies measurements, models, scoring and recommendations; `@irp/resilience-runtime` owns authoritative decision/control-loop orchestration.
2. **State:** Phase 73 owns the cross-domain desired/observed/actual semantic envelope; `RuntimeStateMachine` remains runtime lifecycle authority and domain stores remain owners of domain persistence.
3. **Events:** `@irp/events` is the shared cross-package contract boundary; runtime-local and intelligence-local events remain local unless explicitly promoted. Phase 74 owns concrete event taxonomy/versioning.
4. **Provider registries:** DNS, gateway, tunnel, connectivity and plugin registries remain distinct domain registries. Phase 72 prohibits a generic competing registry.

## Non-goals

- No new autonomous network mutations.
- No replacement of existing DNS, routing, tunnel, gateway or connectivity implementations.
- No AI-driven network control.
- No destructive migration of existing state.
- No new client-side routing or policy engine.
- No creation of a second control-plane runtime package merely to satisfy the roadmap wording.

## Affected documentation

- `docs/architecture/control-plane-ownership.md`
- `docs/architecture/control-plane-phase72-dependencies.md`
- `docs/phases/phase-72.md`

No runtime package is changed by Phase 72's architecture contract.

## Required outputs

1. Canonical control-plane ownership map — **implemented** in `docs/architecture/control-plane-ownership.md`.
2. Explicit desired/observed/actual state semantics and ownership handoff to Phase 73 — **documented and delegated to Phase 73 implementation**.
3. Explicit decision-authority boundary for intelligence versus orchestration — **implemented in the ownership contract**.
4. Event ownership/versioning boundary for Phase 74 — **implemented as an ownership rule; concrete event types remain Phase 74 scope**.
5. Integration dependency record for Phases 73–78 — **implemented** in `docs/architecture/control-plane-phase72-dependencies.md`.
6. Updated contributor/agent guidance so the current roadmap cannot be confused with the historical 70-phase baseline — current state and roadmap references already identify `MASTER_ROADMAP_V2.md` as the post-70 authority; stale conflicting Phase 72 distribution text must be treated as historical and is corrected below.

## Verification

Phase 72 is architecture/contract work only. It must not change runtime networking behavior.

Required checks before certification:

- repository validation;
- documentation validation and internal-link checks;
- architecture/API consistency review;
- confirmation that no duplicate decision/state/policy/event/control engine was introduced;
- GitHub CI green for the resulting branch/PR;
- Phase 71 external release-certification gate remains satisfied before the overall Phase 72 completion gate can close.

Source presence or documentation presence alone is not completion evidence.

## Rollback

Revert the Phase 72 documentation/contract commits. No runtime migration is required because the phase does not alter runtime behavior or persistent state.

## Acceptance criteria

- Canonical control-plane ownership is documented in one normative contract.
- Existing packages are mapped to the control-plane layers without inventing duplicate owners.
- Decision, state and event overlaps are explicitly resolved into ownership rules.
- Phase 73–78 dependencies and integration boundaries are documented.
- Phase 71 external certification remains visible as a prerequisite and is not falsely marked complete.
- Contributor/agent instructions point to the current roadmap V2 and current implementation gate.
- No existing runtime behavior changes solely because this architecture phase was documented.
- Repository/documentation validation and PR CI gates are green before completion is claimed.

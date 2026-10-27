# Phase 73 — Unified Network State Model

## Status

Implementation in progress on `phase/73-unified-network-state`. This phase does not certify Phase 71 or Phase 72 completion.

## Objective

Establish one transport-agnostic semantic model for **desired**, **observed**, and **actual** network state without replacing the existing runtime state machine, network-intelligence snapshots, or domain-specific stores.

## Scope

- Define canonical state-layer semantics: desired, observed, actual.
- Define resource identity and typed resource envelopes suitable for cross-domain reconciliation.
- Define explicit reconciliation status.
- Provide a minimal in-memory implementation for deterministic tests and future adapter-backed stores.
- Add optimistic state-version checking so concurrent writers cannot silently overwrite a newer snapshot.
- Export the contract from `@irp/resilience-runtime`.

## Semantics

- **Desired:** the state the control plane intends to establish, after policy and authorization have admitted it.
- **Observed:** measurements/evidence reported by observation providers about what the network appears to be doing.
- **Actual:** the authoritative applied state known to the execution boundary, including the result of successful mutations.
- **Aligned:** desired, observed and actual representations are equivalent under the current resource signature.
- **Pending:** observed and actual agree, but they differ from desired; reconciliation work may still be required.
- **Drifted:** desired and actual agree, but observation disagrees; the observation path may be stale or inconsistent.
- **Conflicted:** the three layers disagree in a way that cannot safely be reduced to pending or drifted.
- **Unknown:** no meaningful state has been established yet.

These semantics intentionally do not imply that `observed` is always authoritative for applied state or that `actual` is always directly reconstructable from telemetry. Domain adapters remain responsible for producing trustworthy resources.

## Existing ownership preserved

- `RuntimeStateMachine` remains responsible for the lifecycle state of the resilience runtime (`idle`, `observing`, `planning`, etc.). It is not replaced by this model.
- `@irp/network-intelligence` remains responsible for network measurements, snapshots and intelligence inputs.
- Execution adapters remain responsible for applying changes and reporting applied results.
- Domain-specific stores/registries remain owners of their domain data; this model is the cross-domain semantic envelope, not a generic replacement database.

## Non-goals

- No routing, DNS, tunnel, gateway or connectivity behavior changes.
- No autonomous network mutations.
- No persistent database schema or migration.
- No distributed consensus protocol.
- No replacement of `RuntimeStateMachine`.
- No second global state registry outside the canonical runtime state boundary.
- No attempt to make all network state fields globally uniform; resources retain domain-specific attributes.

## Affected packages

- `@irp/resilience-runtime`

## Contract

The canonical types are in `packages/resilience-runtime/src/state/network-state.ts`:

- `NetworkStateLayer`
- `ReconciliationStatus`
- `NetworkStateResource`
- `NetworkStateSnapshot`
- `NetworkStateUpdate`
- `NetworkStateStore`
- `InMemoryNetworkStateStore`

The resource envelope uses the existing `AuditFields` contract for provenance, correlation and schema metadata.

## Concurrency rule

`NetworkStateStore.apply()` supports an optional `expectedStateVersion`. A mismatch is rejected instead of silently overwriting newer state. This is an optimistic concurrency primitive, not a claim of distributed consistency; distributed conflict resolution belongs to Phase 147.

## Tests

`packages/resilience-runtime/tests/network-state.test.ts` covers:

- initial unknown state;
- separation of desired/observed/actual layers;
- aligned reconciliation;
- pending reconciliation;
- stale-writer rejection.

## Verification

Before completion:

1. `pnpm validate`
2. `pnpm validate:docs`
3. `pnpm typecheck`
4. `pnpm lint`
5. `pnpm --filter @irp/resilience-runtime test`
6. `pnpm build`
7. GitHub CI must be green.

The implementation must not change network behavior. Phase completion requires verification evidence in the PR; source presence alone is insufficient.

## Rollback

Revert the Phase 73 commits. No runtime migration is required because the initial implementation is an in-memory semantic contract and does not alter existing persistent state.

## Acceptance criteria

- A single exported desired/observed/actual contract exists in the canonical resilience-runtime package.
- Resource identity and provenance are explicit.
- Reconciliation status is deterministic and fail-safe when state is incomplete or contradictory.
- Concurrent stale writers are rejected when an expected version is supplied.
- Existing runtime lifecycle state remains separate and unchanged.
- Tests cover normal, boundary and concurrency conflict behavior.
- No duplicate global state engine/store is introduced.
- Required repository and package verification is green before completion is claimed.

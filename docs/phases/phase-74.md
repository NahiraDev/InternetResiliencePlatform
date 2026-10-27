# Phase 74 — Control-Plane Contracts

## Status

Implementation in progress on `phase/74-control-plane-contracts`. Phase 71 certification remains intentionally deferred.

## Objective

Establish one versioned, typed contract envelope for communication between the existing intelligence, policy, execution, and assurance boundaries without creating duplicate service abstractions or a second event bus.

## Dependencies

- Phase 72 — Control-Plane Architecture Completion
- Phase 73 — Unified Network State Model
- Existing `@irp/resilience-runtime` domain types and ports
- Existing `@irp/events` `DomainEvent` / `EventBus` contract

## Scope

- Define a canonical control-plane contract version.
- Define typed event identities for intelligence, policy, execution, and assurance transitions.
- Carry correlation and optional causation identifiers across boundaries.
- Keep domain payloads typed using the existing runtime domain contracts.
- Export the contracts from `@irp/resilience-runtime`.

## Contract

Canonical implementation: `packages/resilience-runtime/src/contracts/control-plane.ts`.

The contract family is:

- `control-plane.intelligence.observation-reported`
- `control-plane.policy.evaluation-completed`
- `control-plane.execution.action-completed`
- `control-plane.assurance.verification-completed`

Every event carries:

- `contractVersion`
- `correlationId`
- optional `causationId`
- `producer`
- existing `DomainEvent` identity/timestamp fields
- a domain-specific typed payload

## Ownership

- `@irp/network-intelligence` owns observation production and measurement semantics.
- Policy components own policy evaluation semantics.
- Execution adapters own applied-action semantics.
- Assurance components own verification/reconciliation semantics.
- `@irp/events` remains the transport-level event bus.
- `@irp/resilience-runtime` owns the cross-domain contract envelope.

This phase defines contracts; it does not wire new autonomous behavior into the runtime loop.

## Non-goals

- No second event bus.
- No duplicate provider/service abstraction replacing existing ports.
- No routing, DNS, tunnel, gateway, or connectivity behavior changes.
- No autonomous mutations.
- No persistence or distributed-consensus protocol.
- No replacement of `RuntimeStateMachine`.
- No change to Phase 73 desired/observed/actual semantics.

## Tests

`packages/resilience-runtime/tests/control-plane-contracts.test.ts` verifies:

- all four control-plane domains use the canonical contract version;
- all four typed event variants are representable through `ControlPlaneEventUnion`;
- each event preserves correlation and causation context;
- producer identity matches the corresponding control-plane domain;
- the complete four-event contract family is covered.

## Verification

Before completion:

1. `pnpm validate`
2. `pnpm validate:docs`
3. `pnpm typecheck`
4. `pnpm lint`
5. `pnpm --filter @irp/resilience-runtime test`
6. `pnpm build`
7. GitHub CI must be green.

## Current implementation evidence

- Phase 73 is merged into `main` as `04266a639c800fba020eb7a2b38aa2426e7dd446`.
- Phase 74 contract implementation already exists in `@irp/resilience-runtime` and is now covered by all four typed event variants.
- The dedicated Phase 74 branch is based on the current `main` baseline.
- Full repository verification is still required; completion must not be claimed until the required commands and CI are green.

## Acceptance criteria

- One versioned cross-domain contract family exists in the canonical runtime boundary.
- Intelligence, policy, execution, and assurance each have a distinct typed event contract.
- Correlation and causation context can traverse the control-plane boundary.
- Existing `DomainEvent` and `EventBus` infrastructure is reused rather than duplicated.
- Existing runtime ports remain authoritative for provider/service behavior.
- No network behavior or autonomous execution is introduced.
- Verification evidence is available before merge.

## Rollback

Revert the Phase 74 commits. The change is contract-only and introduces no persistence migration or runtime network mutation.

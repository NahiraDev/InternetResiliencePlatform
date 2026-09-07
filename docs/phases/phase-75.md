# Phase 75 — Decision Orchestration

## Status

Implementation in progress on `phase/75-decision-orchestration`.

Phase 74 is complete and merged. Phase 71 external release certification remains intentionally deferred by project direction and is not a blocker for starting this phase.

## Objective

Create the canonical decision-orchestration boundary that deterministically composes:

- incident and measurement-derived candidates;
- existing network decision intelligence;
- policy allow/deny constraints;
- required capabilities;
- runtime security/trust state;
- confidence thresholds;
- deterministic tie-breaking.

The orchestrator must coordinate existing decision intelligence rather than create a second decision engine.

## Canonical ownership

- `@irp/resilience-runtime` owns orchestration and runtime authority.
- `@irp/network-intelligence` owns measurement/model/decision intelligence and candidate scoring.
- Policy snapshots remain the source of action authorization constraints.
- Capability snapshots remain the source of available runtime capabilities.
- Security/trust state remains a hard gate.
- Planning, validation, execution, verification and recovery remain downstream runtime stages.

## Implementation started

`packages/resilience-runtime/src/decision-orchestration.ts` adds `DecisionOrchestrator` and `DecisionOrchestrationResult`.

The boundary:

1. obtains candidates from the existing `DecisionProvider`;
2. rejects candidates with provider rejection reasons;
3. enforces policy allow/deny lists;
4. enforces policy and candidate capability requirements;
5. enforces confidence thresholds;
6. fails closed when capability or runtime security trust is unavailable;
7. orders eligible candidates deterministically by confidence, expected benefit, risk, then stable candidate ID;
8. returns the selected candidate without performing any network mutation.

## Tests

`packages/resilience-runtime/tests/decision-orchestration.test.ts` covers:

- policy, capability and security filtering;
- deterministic ordering and tie-breaking;
- fail-closed behavior when trust is unavailable;
- preservation of provider candidate data (no mutation).

## Non-goals

- no second decision engine;
- no autonomous network mutation;
- no replacement of `NetworkDecisionEngine`;
- no replacement of `CanonicalDecisionProvider`;
- no policy persistence or policy-authoring UI;
- no action transaction semantics (Phase 76);
- no rollback/recovery kernel (Phase 77);
- no broad closed-loop execution (Phase 78).

## Verification gates

Before completion:

- `pnpm validate`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter @irp/resilience-runtime test`
- `pnpm build`
- GitHub CI green

Do not declare Phase 75 complete from source presence alone.

## Rollback

The phase is additive. Removing the orchestration export, implementation and dedicated tests restores the previous `DecisionProvider` integration without changing network providers or mutation paths.

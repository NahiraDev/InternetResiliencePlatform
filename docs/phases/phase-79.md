# Phase 79 — Intent Model & Lifecycle

## Status

Implementation started on `phase/79-intent-model-lifecycle` from the merged Phase 78 baseline.

Phase 78 — Closed-Loop Control Foundation is merged on `main`. Phase 71 external release certification remains a separate release-evidence gate and does not block this architecture phase.

## Objective

Define the canonical, typed network-intent model and deterministic lifecycle needed before intent ingestion and translation. An intent expresses a desired network outcome without embedding policy evaluation, planning or low-level execution details.

## Dependencies

- Phase 73 — Unified Network State Model
- Phase 74 — Control-Plane Contracts
- Phase 75 — Decision Orchestration
- Phase 76 — Action Transaction Engine
- Phase 77 — Safety, Rollback & Recovery Kernel
- Phase 78 — Closed-Loop Control Foundation

## Affected package

- `@irp/core`

The model is added to the existing core domain package to avoid introducing a parallel domain package before the API/ingestion boundary is defined in Phase 80.

## Canonical model

`NetworkIntent` contains stable identity, monotonic version, lifecycle status, priority, declarative desired outcome, optional target/constraints, effective/expiration timestamps, supersession identity and metadata. It contains no executable network mutation instructions.

## Lifecycle

Allowed transitions are explicit:

- `draft → active`
- `draft → cancelled`
- `draft → expired`
- `active → completed`
- `active → superseded`
- `active → cancelled`
- `active → expired`

Terminal states are `completed`, `superseded`, `cancelled`, and `expired`. They cannot transition further. Every transition increments the version and returns a new immutable snapshot.

## Safety invariants

- intent IDs and desired outcomes must be non-empty;
- timestamps must be valid ISO-8601 values;
- `effectiveFrom` must precede `expiresAt` when both exist;
- invalid lifecycle transitions fail closed;
- terminal intents cannot be reopened through lifecycle commands;
- effective-window evaluation uses deterministic `[effectiveFrom, expiresAt)` semantics;
- the model exposes no direct network mutation capability.

## Non-goals

No HTTP/API ingestion, persistence repository, intent-to-plan compiler, policy engine, conflict resolution, execution, network mutation or autonomous scheduler. These are later-phase concerns and must consume this canonical model.

## Acceptance criteria

- `NetworkIntent` is publicly exported from `@irp/core`;
- creation validates identity, outcome and temporal bounds;
- lifecycle transitions are explicit and deterministic;
- every transition increments version;
- lifecycle objects are immutable;
- terminal states are enforced;
- effective-window semantics and invalid paths are covered by tests;
- repository validate, typecheck, lint, tests and build are green before merge.

## Verification boundary

Source presence is not completion evidence. Phase 79 completion requires CI evidence for package and repository gates, followed by contract review against Phase 80 ingestion requirements.

## Rollback

Remove `packages/core/src/intent.ts`, `packages/core/src/intent.test.ts`, and the intent exports from `packages/core/src/index.ts`. Existing core APIs and Phase 78 runtime behavior remain unchanged.

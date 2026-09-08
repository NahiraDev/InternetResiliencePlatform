# Phase 76 — Action Transaction Engine

## Status

Implementation in progress on `phase/76-action-transaction-engine`.

Phase 75 is merged. Phase 71 external release certification remains intentionally deferred and is not a blocker for this phase.

## Objective

Formalize a single action transaction boundary around the existing planner, validator, executor and event contracts.

The transaction engine must provide:

- deterministic transaction identity;
- ordered lifecycle states;
- idempotent replay for completed transactions;
- conflict detection for the same idempotency key with a different action;
- explicit observable lifecycle events;
- bounded in-memory retention;
- delegation to the existing `ActionExecutor` without replacing adapter execution.

## Canonical ownership

- `@irp/resilience-runtime` owns transaction lifecycle and runtime authority.
- `ActionExecutor` remains the only execution mutation boundary.
- Runtime policy and validation remain authoritative before execution.
- Adapter selection and network mutation remain owned by the existing execution layer.
- Rollback, checkpoints and recovery semantics remain Phase 77.

## Implementation

`packages/resilience-runtime/src/transactions/action-transaction.ts` adds `ActionTransactionEngine`.

The engine:

1. derives a stable idempotency key from the request key or action identity;
2. rejects conflicting reuse of a key for a different action;
3. returns the prior result for a completed duplicate request;
4. serializes execution per transaction key;
5. emits created, executing, committed and failed lifecycle events;
6. delegates the actual mutation to the existing `ActionExecutor`;
7. retains bounded transaction records for replay/observability.

## Non-goals

- no replacement execution adapter framework;
- no rollback or recovery;
- no distributed/persistent transaction store;
- no cross-device distributed consensus;
- no multi-action saga semantics;
- no autonomous control loop.

## Acceptance criteria

- duplicate requests never invoke the underlying executor twice;
- conflicting idempotency reuse is rejected;
- lifecycle ordering is deterministic;
- transaction events expose correlation and transaction identity;
- existing executor remains the sole mutation boundary;
- runtime uses the transaction engine for execution;
- dedicated unit tests cover success, duplicate, conflict and failure;
- `pnpm validate`, `pnpm typecheck`, `pnpm lint`, runtime tests, build and GitHub CI are green before Phase 76 is declared complete.

## Rollback

Remove the transaction engine integration and its dedicated tests. The existing `ActionExecutor` path remains intact and can be restored without changing adapters.

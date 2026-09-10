# Phase 77 — Safety, Rollback & Recovery Kernel

## Status

**Implemented and merged on `main` in PR #237.** The implementation landed before the current Phase 78 branch was created. External Phase 71 release certification remains deferred and is not a dependency for this architecture phase.

## Objective

Introduce one explicit safety boundary around the existing transaction/execution/recovery primitives. The kernel must prevent unsafe mutations before execution, bound blast radius, create a checkpoint when supported, and provide deterministic rollback/recovery behavior without creating a second policy engine or execution engine.

## Canonical ownership

- `@irp/resilience-runtime` owns the safety/rollback/recovery kernel contract.
- `RuntimePolicyArbitrator` remains authoritative for policy decisions.
- `ActionTransactionEngine` remains authoritative for transaction lifecycle and idempotency.
- `ActionExecutor` remains the only mutation boundary.
- Existing `RecoveryProvider` / `@irp/failover` remains the canonical recovery implementation.
- The kernel coordinates these authorities; it does not replace them.

## Scope

1. Validate safety preconditions before mutation.
2. Enforce bounded blast-radius limits.
3. Support explicit checkpoints through an injectable checkpoint provider.
4. Execute through the existing transaction/executor path.
5. Roll back failed executions when a rollback handler and checkpoint are available.
6. Delegate post-verification recovery to the existing RecoveryProvider.
7. Emit deterministic safety lifecycle events.
8. Fail closed for invalid safety input.

## Non-goals

- no second policy engine;
- no second transaction engine;
- no distributed checkpoint store;
- no autonomous control loop;
- no cross-device consensus;
- no replacement for `@irp/failover`;
- no implicit unsafe live mutation when safety evidence is missing.

## Safety contract

A mutating action is eligible only when:

- the context is not cancelled and its deadline is valid and unexpired;
- the plan is policy-allowed;
- the security context is trusted for live/safe mutation;
- action risk and blast radius are finite and within configured limits;
- required capabilities remain available;
- simulation mode does not perform live mutation.

The default blast-radius bound is 0.75. A plan may provide an explicit numeric `metadata.blastRadius`; otherwise the plan risk is used as the conservative estimate.

## Rollback contract

Rollback is attempted only after a failed execution when:

- a checkpoint was created;
- a rollback handler exists;
- the action is not a noop.

Rollback failure is surfaced as a degraded recovery result rather than being hidden.

## Acceptance criteria

- unsafe plans are blocked before the executor is called;
- cancelled/expired contexts fail closed;
- untrusted live mutation is blocked;
- excessive or invalid blast radius is blocked;
- checkpoint creation occurs before mutation;
- failed execution triggers rollback when supported;
- rollback failure is observable;
- successful execution is not rolled back;
- verification failure can be delegated to the existing RecoveryProvider;
- lifecycle events include correlation and action identity;
- dedicated unit tests cover boundary and failure paths;
- `pnpm validate`, `pnpm typecheck`, `pnpm lint`, runtime tests and build are green before completion.

## Verification

The implementation and dedicated unit tests were merged in PR #237. Repository-level verification remains governed by the CI gates and later Phase 78 integration evidence.

## Rollback

Remove the kernel integration and its tests. Existing transaction, executor and failover paths remain independently usable.

# Phase 78 — Closed-Loop Control Foundation

## Status

Implementation started on `phase/78-closed-loop-control` from `main` at `164c9793ac8819492939d9d59b6c3b529cc506cd`.

Phase 77 — Safety, Rollback & Recovery Kernel is merged on `main`. Phase 71 external release certification remains a separate release-evidence gate and does not block this architecture work.

## Objective

Provide one bounded closed-loop orchestration boundary around the existing `@irp/resilience-runtime` cycle. The loop must repeatedly execute the canonical observe → decide → apply → verify/recover cycle only within explicit bounds and must stop deterministically on healthy, blocked, failed, aborted or maximum-cycle conditions.

## Canonical ownership

- `@irp/resilience-runtime` remains the canonical decision/control-loop runtime.
- `DecisionOrchestrator` remains the decision composition authority.
- `RuntimePolicyArbitrator` and existing policy contracts remain policy authority.
- `ActionTransactionEngine` remains transaction authority.
- `ActionExecutor` remains the mutation boundary.
- `SafetyRollbackRecoveryKernel` remains the safety/rollback/recovery boundary.
- `FailoverRecoveryProvider` remains the canonical recovery implementation.
- The Phase 78 controller owns only bounded repetition, cancellation and stop conditions.

## Scope

1. Provide a reusable bounded loop controller over the existing runtime cycle.
2. Enforce a hard maximum cycle bound with safe-by-default single-cycle execution.
3. Propagate deterministic correlation and idempotency keys per cycle.
4. Support cooperative abort between cycles.
5. Stop on healthy terminal outcomes when configured.
6. Stop immediately on blocked or failed decisions.
7. Preserve the existing runtime as the only owner of observe/decide/apply/verify/recover semantics.
8. Add deterministic unit coverage for bounds, terminal outcomes and cancellation.

## Non-goals

- no second decision engine;
- no second policy engine;
- no second execution engine;
- no autonomous unbounded loop;
- no direct host-network mutation from the controller;
- no distributed coordination;
- no new persistence layer;
- no replacement for the existing `ResilienceRuntime` cycle.

## Safety contract

The controller is bounded by construction:

- `maxCycles` defaults to `1`;
- `maxCycles` is limited to `10`;
- `intervalMs` must be a non-negative integer;
- an aborted signal prevents a new runtime cycle from starting;
- blocked and failed decisions terminate the loop immediately;
- each cycle uses a distinct deterministic correlation/idempotency suffix.

The controller does not bypass runtime policy, validation, safety, transaction, execution, verification or recovery checks.

## Acceptance criteria

- bounded loop executes the canonical runtime cycle without duplicating its internal authorities;
- default execution is limited to one cycle;
- maximum cycle bound is enforced and invalid bounds fail closed;
- healthy outcome stops the loop when `stopWhenHealthy` is enabled;
- blocked outcome stops further cycle attempts;
- failed outcome stops further cycle attempts;
- aborted loop performs zero additional runtime cycles;
- every cycle receives deterministic correlation and idempotency identifiers;
- dedicated tests cover normal, boundary and cancellation paths;
- repository validate, typecheck, lint, runtime tests and build are green before completion.

## Verification boundary

Phase 78 is not complete from source presence alone. Completion requires CI evidence for the dedicated tests plus the repository gates and a runtime-level integration test showing the loop invokes the canonical `ResilienceRuntime` rather than a parallel control path.

## Rollback

Remove `closed-loop.ts`, its tests and the public export. Existing `ResilienceRuntime.cycle()` behavior remains unchanged.

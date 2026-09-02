# Phase 57 — Control Loop Integrity & Real Postconditions

## Objective

Close the gap between the resilience runtime's declared control loop and the actual runtime semantics.

The required invariant is:

```text
Observe → Measure → Decide → Policy/Safety → Apply → Verify actual state → Recover/Rollback → Reconcile
```

An action MUST NOT be reported as successful merely because an adapter accepted/delegated it. A live execution requires a runtime adapter that explicitly supports live mutation and a verification path that observes the resulting state.

## Scope

1. Prevent the runtime from fabricating live execution success.
2. Route live execution through registered runtime adapters.
3. Route verification through the adapter that performed the mutation.
4. Make unsupported live capabilities fail closed.
5. Preserve simulation/safe-mode semantics without pretending that simulated state is actual state.
6. Establish the phase-level contract for real network measurements, rollback, and state reconciliation.

## Mandatory invariants

- `supportsLive === false` MUST never produce a live `success` execution.
- A live action without an eligible adapter MUST fail closed.
- A live action without adapter verification support MUST not be considered verified.
- `afterState` MUST describe observed adapter state, not `{ delegated: true }`.
- Verification MUST be based on adapter-observed postconditions, not merely the plan's expected postconditions.
- Simulation MUST remain explicitly marked as simulated.
- Future real network probes MUST expose measurement semantics matching their names; estimates must not be labelled as packet loss, throughput, or gateway reachability.

## Follow-up work in Phase 57

- Replace DNS-failure-as-packet-loss with a real packet-loss probe abstraction.
- Replace synthetic throughput calculation with real download/upload measurements.
- Implement actual gateway reachability and captive-portal detection.
- Add transactional tunnel rotation and gateway failover rollback/reconciliation.
- Add canonical runtime/gateway/tunnel state reconciliation.

## Completion criteria

Phase 57 is complete only when a live control-loop action can be traced from a policy-approved plan through a real adapter mutation, real postcondition observation, and rollback/reconciliation on failure.

## Status

**In progress.** The control-loop contract and fail-closed semantics are implemented, but the phase is not considered complete until a real live adapter, real postcondition verification, and rollback/reconciliation evidence are available.

## Verification

Repository-level verification is performed by the CI validation, typecheck, lint, test, and build gates. Live completion additionally requires runtime evidence showing an authorized mutation, verified postconditions, and successful rollback/reconciliation on failure.

# ADR — Phase 33 Automatic Optimization Safety Boundary

## Status

Accepted

## Context

Phase 32 recommendations must not become an implicit authorization to mutate network state. The existing resilience runtime already defines policy arbitration, action validation, execution, verification, and recovery boundaries.

## Decision

Implement automatic optimization as a separate orchestration package, `@irp/auto-optimization`, that consumes existing `ActionPlan` values and runtime ports.

The package is explicitly opt-in and defaults to disabled. It performs independent recommendation-level guardrails, then delegates the final authority to `RuntimePolicyArbitrator`. All mutations remain behind `ActionValidator` and `ActionExecutor`; every mutation is followed by `ActionVerifier`. Verification failure triggers an explicit rollback adapter when configured and available.

No direct route, DNS, connectivity, tunnel, kernel, shell, or provider access is permitted from this package.

## Consequences

Positive:

- One authoritative runtime policy path remains in control of infrastructure mutation.
- Auto-apply can be tested independently from provider implementations.
- Opt-in, cooldown, budgets, risk, confidence, and trust checks are centrally testable.
- Future API, desktop, or database adapters can be added without changing execution semantics.

Negative:

- A production integration must provide a persistent state store and control surface.
- Rollback behavior remains dependent on the runtime/provider adapter supplied by the application.
- Medium/high-risk recommendations require a future approval workflow instead of automatic application under the default policy.

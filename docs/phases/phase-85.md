# Phase 85 — Intent Assurance & Drift Management

## Status

**Contract formalized and minimal observe-only drift detector implemented (issue #14).** `detectIntentDrift` reuses `isCompiledIntentEffective` and returns structured, non-mutating results. Full continuous correction remains out of scope. Disposition remains **PARTIAL** pending CI evidence on the implementing SHA.

## Objective

Define the contract for continuously assuring that observed network state remains within the bounds of effective intents and for detecting and reporting drift. Assurance is observational and advisory by default; any corrective action must still pass the safety kernel, intent governance, and privileged mutation boundary.

## Dependencies

- Phase 79 — Intent Model & Lifecycle
- Phase 81 — Intent Translation / Compilation
- Phase 84 — Safety Constraints & Change Governance
- Phase 78 — Closed-Loop Control Foundation (bounded verification loop)

## Canonical owner

- `@irp/resilience-runtime` — intent effective-window evaluation (`isCompiledIntentEffective`, lifecycle status)
- Observation and decision orchestration packages that already produce observed vs desired comparisons
- Future drift reporter must consume, not replace, the canonical intent store

## Scope

- Evaluate whether a compiled intent remains effective given current time and lifecycle state.
- Provide a deterministic drift signal when observed state diverges from the desired outcome of an effective intent (threshold and metric definitions to be specified in implementation).
- Expose drift as structured evidence consumable by the closed-loop controller and audit surfaces.
- Require any drift-triggered correction to be re-admitted through intent governance and the safety kernel.

## Non-goals

- Automatic high-risk mutation solely on drift detection.
- A second intent store or parallel assurance engine.
- Production device or regional drift evidence (issue #4).
- Full predictive or AI-driven drift forecasting (later phases).

## Acceptance criteria

1. Effective-window evaluation correctly classifies intents as effective or expired/superseded using the existing `[effectiveFrom, expiresAt)` semantics.
2. A drift detection function (when implemented) returns a structured result containing intent identity, observed delta, severity, and recommended admission.
3. Drift results never directly invoke mutation; they only feed the existing decision/orchestration path.
4. Tests cover effective/expired boundary cases and at least one synthetic drift scenario.
5. Architecture guards continue to forbid a competing control plane.

## Verification boundary

- Package unit tests for intent effective evaluation and any new drift module.
- Existing CI that runs resilience-runtime tests.
- No claim of live network drift evidence until device/runtime validation exists.

## Rollback considerations

- Documentation-only until implementation lands.
- Implementation must be feature-flagged or safe-by-default (observe-only) so it can be disabled without affecting the closed-loop stop conditions.

## Related issues

- Tracking: issue #14

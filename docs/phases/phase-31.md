# Phase 31 — Production Reliability, SLOs & Failure-Budget Enforcement

## Objective

Turn the telemetry layer into an operational reliability control plane. Phase 31 introduces deterministic Service Level Objective (SLO) evaluation and error-budget calculations without coupling policy decisions to a vendor-specific monitoring backend.

## Implemented

- Added `evaluateSlo()` to `@irp/telemetry`.
- Added explicit availability and average-latency targets.
- Added error-budget and remaining-error-budget calculations.
- Added deterministic handling for empty windows and invalid measurements.
- Added unit coverage for healthy windows, availability breaches, latency breaches, empty windows, and invalid input.

## Reliability contract

An SLO evaluation is `met` only when both configured availability and average-latency targets are satisfied. A breach is deterministic and side-effect free: the evaluator does not change routes, DNS, runtime state, or recovery policy.

## Next integration gates

The next implementation increment must consume these evaluations from the API/runtime telemetry path and expose operational signals without leaking user identifiers or request payloads. Any automated recovery decision must remain behind the existing policy/safety/verification pipeline.

## Definition of Done

- `@irp/telemetry` exports the SLO evaluator.
- Unit tests cover the reliability contract.
- Invalid telemetry input fails closed with explicit validation errors.
- No direct infrastructure mutation is performed by the evaluator.
- SLO policy can later be backed by Prometheus/OpenTelemetry data without changing the evaluation contract.
- CI `validate`, typecheck, test, and build remain green before merge.

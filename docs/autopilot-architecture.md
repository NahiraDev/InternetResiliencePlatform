# Network Autopilot Architecture (Phase 26)

The Network Autopilot is implemented in `packages/resilience-runtime/src/autopilot/autopilot.ts` and reuses the existing runtime observation providers, incident correlator, in-memory event sink, and telemetry sink.

## Safety model

- Default configuration is disabled and observe-only.
- AI or heuristic recommendations are not execution authorization.
- Every selected action passes deterministic policy and safety gates before apply.
- `UNKNOWN` diagnosis confidence escalates instead of executing.
- `OBSERVE_ONLY`, `ADVISORY`, and `APPROVAL_REQUIRED` never apply actions directly.
- Consequential actions require rollback strategy and pre-action snapshot.

## Control loop

1. Observe using `ObservationAggregator`.
2. Measure into an `AutopilotMeasurement` with `healthy`, `degraded`, `unknown`, or `critical` health.
3. Detect degradation, threshold failures, or recovery.
4. Diagnose through existing incident correlation.
5. Decide deterministically through typed action creation.
6. Evaluate policy and safety gates.
7. Plan dry-run, shadow, canary, or apply steps.
8. Apply via the centralized executor with idempotency and locking.
9. Verify actual post-action health.
10. Roll back and recover if verification fails.
11. Emit immutable audit events and telemetry counters.

## Phase 27 candidates

Persistent stores, external distributed locks, authenticated approval persistence, and live DNS/routing adapters should replace the safe simulator once production policies are proven.

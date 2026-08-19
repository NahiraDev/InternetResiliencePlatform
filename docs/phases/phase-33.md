# Phase 33 — Automatic Optimization

## Goal

Allow the platform to automatically apply only high-confidence, low-risk recommendations when the operator has explicitly opted in. Automatic optimization is a control-plane capability, not a second execution path: every mutation must still pass runtime policy evaluation, validation, execution, verification, and rollback safeguards.

## Why This Phase Exists

Phase 31 established deterministic SLO evaluation and the runtime already exposes candidate actions, policy arbitration, action validation, execution, verification, and recovery ports. Phase 33 adds the missing opt-in automation layer that consumes recommendations without allowing recommendations to bypass the established safety pipeline.

The implementation deliberately starts disabled. A recommendation is never sufficient authority to mutate infrastructure by itself.

## Expected Outputs

- `@irp/auto-optimization` workspace package.
- Typed recommendation and auto-apply policy contracts.
- Explicit opt-in/opt-out control with persistent-store interface.
- Deterministic eligibility evaluation.
- Runtime-policy and capability-trust enforcement.
- Confidence, risk, expected-benefit thresholds.
- Cooldown and action-budget guardrails.
- Expiry handling for stale recommendations.
- Dry-run mode.
- Validation before mutation.
- Mandatory post-execution verification.
- Optional rollback on failed verification; failure remains surfaced when rollback is unavailable or unsuccessful.
- Event and telemetry hooks without user payloads or identifiers.
- Unit tests covering safety and execution behavior.

## Architecture

```text
Learning / Recommendation Engine
            │
            │ OptimizationRecommendation
            ▼
┌─────────────────────────────────────┐
│ AutoOptimizationEngine              │
│                                     │
│  1. opt-in / policy gate            │
│  2. trust + runtime checks          │
│  3. confidence/risk/benefit checks  │
│  4. expiry/cooldown/budget checks   │
│  5. RuntimePolicyArbitrator         │
│  6. ActionValidator                 │
│  7. dry-run or ActionExecutor       │
│  8. ActionVerifier                  │
│  9. rollback on verification error  │
│ 10. state + events + telemetry      │
└─────────────────────────────────────┘
            │
            ▼
      Existing runtime adapters
```

The component depends on `@irp/resilience-runtime` types and ports, so it cannot directly manipulate routing, DNS, tunnels, connectivity, or kernel state.

## Components

### `OptimizationRecommendation`

A normalized recommendation containing an existing `ActionPlan`, confidence, risk, expected benefit, provenance, explanation, and optional expiry timestamp.

### `AutoOptimizationPolicy`

Controls whether automation is active and the conditions under which it may run.

Default safety posture:

- `enabled=false`
- `minimumConfidence=90`
- `maximumRisk=25`
- `minimumExpectedBenefit=60`
- `allowedRisks=['low']`
- `requireLiveRuntime=true`
- trusted security context required
- trusted capability snapshot required
- `dryRun=false`
- verification failure triggers rollback when a rollback adapter is available
- 30 second cooldown
- six successful/rolled-back actions per one-hour window

### `AutoOptimizationStateStore`

A persistence port for opt-in state, cooldown/budget counters, and the last automation outcome. The phase provides `MemoryAutoOptimizationStateStore`; production persistence may be supplied by a later storage adapter without changing the engine contract.

### `AutoOptimizationPorts`

The engine consumes the existing runtime ports:

- `ActionValidator` — validates the action plan before mutation.
- `ActionExecutor` — performs the already-approved action.
- `ActionVerifier` — verifies postconditions.
- `rollback` — restores the previous state when verification fails.
- `EventSink` — emits structured lifecycle events.
- `TelemetrySink` — exposes counters without request payloads.
- `RuntimePolicyArbitrator` — the final runtime policy gate; defaults to the existing implementation.

## Decision Contract

`evaluate()` is deterministic and side-effect free except for normal budget-window rollover state maintenance. It returns:

- `allowed`
- human-readable `reasons`
- machine-readable `blockReasons`
- the final runtime policy result

The engine blocks when any of the following is true:

- automation is not explicitly enabled;
- runtime is not live when live mode is required;
- manual override is active;
- security or capability trust is missing;
- recommendation or action-plan confidence is below threshold;
- risk is above the configured maximum;
- the risk class is not enabled;
- expected benefit is too low;
- the action intent is explicitly denied;
- recommendation is expired;
- action budget is exhausted;
- cooldown is active;
- existing runtime policy rejects the plan.

## Execution Contract

A successful automatic optimization follows this order exactly:

```text
recommendation
  → evaluate
  → validate
  → optional dry-run
  → execute
  → verify
  → applied OR rollback
```

No direct kernel/network mutation exists in this package.

A failed execution is reported without pretending success. A failed verification triggers rollback when enabled and an adapter is supplied. If rollback fails or is unavailable, the outcome is `failed`, never `applied`.

## Interfaces

Key public interfaces are exported from `packages/auto-optimization/src/index.ts`:

- `OptimizationRecommendation`
- `AutoOptimizationPolicy`
- `AutoOptimizationState`
- `AutoOptimizationStateStore`
- `MemoryAutoOptimizationStateStore`
- `AutoOptimizationPorts`
- `AutoOptimizationEvaluation`
- `AutoOptimizationResult`
- `AutoOptimizationEngine`
- `defaultAutoOptimizationPolicy()`
- `buildRecommendation()`

## Events

The engine emits the following event names when an `EventSink` is configured:

- `auto_optimization.evaluated`
- `auto_optimization.blocked`
- `auto_optimization.validation_failed` (represented through the blocked event with `validation_failed` reason)
- `auto_optimization.dry_run`
- `auto_optimization.applied`
- `auto_optimization.verified`
- `auto_optimization.rolled_back`
- `auto_optimization.failed`

Events contain recommendation/action identifiers and technical outcomes only. User credentials, request bodies, raw network payloads, and secrets are not emitted.

## Telemetry

Optional counters emitted through `TelemetrySink`:

- `irp_auto_optimization_blocked_total`
- `irp_auto_optimization_validation_failed_total`
- `irp_auto_optimization_dry_run_total`
- `irp_auto_optimization_applied_total`
- `irp_auto_optimization_failed_total`
- `irp_auto_optimization_verification_failed_total`
- `irp_auto_optimization_rollback_total`

The engine does not create a second metrics registry.

## APIs / Control Surface

Phase 33 defines the application-level control contract rather than coupling the package to a specific HTTP/UI framework.

Required user controls:

- enable automatic optimization;
- disable automatic optimization immediately;
- inspect effective policy;
- inspect current cooldown/budget state;
- enable dry-run for rollout/testing;
- review the last outcome and recommendation identifier.

An API or desktop adapter can map these controls to HTTP/IPC without changing the engine.

## Database Changes

No database migration is required in this phase. The state store is abstracted behind `AutoOptimizationStateStore` so persistent storage can be introduced later without changing the safety contract.

A production persistence adapter should store at minimum:

- enabled state;
- policy version;
- window start/count;
- last applied timestamp;
- last outcome;
- last recommendation ID;
- audit correlation ID.

## Configuration

The initial policy is code-level and must be explicitly enabled by the caller. Production configuration should map to the exported policy fields using validated environment/config schema.

Suggested keys:

```text
AUTO_OPTIMIZATION_ENABLED=false
AUTO_OPTIMIZATION_MIN_CONFIDENCE=90
AUTO_OPTIMIZATION_MAX_RISK=25
AUTO_OPTIMIZATION_MIN_BENEFIT=60
AUTO_OPTIMIZATION_COOLDOWN_MS=30000
AUTO_OPTIMIZATION_BUDGET_WINDOW_MS=3600000
AUTO_OPTIMIZATION_MAX_ACTIONS_PER_WINDOW=6
AUTO_OPTIMIZATION_DRY_RUN=false
AUTO_OPTIMIZATION_ROLLBACK_ON_VERIFY_FAILURE=true
```

Configuration must be fail-closed for invalid numeric bounds.

## Dependencies

- `@irp/resilience-runtime`
- TypeScript
- Vitest for tests

No network client, shell execution, privileged syscall, database client, or provider SDK is introduced by this phase.

## Security Considerations

- Automation defaults to disabled.
- Manual override wins over automation.
- Runtime policy remains authoritative.
- Untrusted security context blocks automatic mutation.
- Untrusted capability snapshots block automatic mutation.
- Low-confidence or high-risk recommendations are blocked.
- Dangerous intents such as `rollback` and `degraded_mode` are denied by the default policy; they remain recovery/control-plane operations.
- Expired recommendations cannot be applied.
- Cooldown and action budgets reduce rapid repeated mutation.
- Dry-run provides a non-mutating rollout mode.
- Verification is mandatory after mutation.
- Verification failure never silently becomes success.
- Rollback is explicit and bounded by the supplied adapter.
- No secret or user payload is placed in lifecycle telemetry.

## Performance Targets

- Eligibility evaluation: synchronous CPU-only decision path plus one policy evaluation; target < 5 ms excluding the injected policy provider.
- No unbounded queues or retries.
- Action execution and verification are delegated to existing bounded runtime infrastructure.
- State store operations are awaited and must remain O(1) for the reference memory implementation.

## Tasks

### Epic 33.1 — Auto-Apply Policy

- [x] Create normalized recommendation contract.
- [x] Add explicit opt-in state.
- [x] Add confidence/risk/benefit thresholds.
- [x] Add denied-intent policy.

### Epic 33.2 — Safety Guardrails

- [x] Enforce live-mode requirement.
- [x] Enforce manual override.
- [x] Enforce trust checks.
- [x] Enforce expiry.
- [x] Enforce cooldown.
- [x] Enforce action budget.
- [x] Add dry-run mode.

### Epic 33.3 — Safe Application Lifecycle

- [x] Reuse runtime policy arbitration.
- [x] Validate before execute.
- [x] Verify after execute.
- [x] Roll back failed verification.
- [x] Surface unsuccessful rollback as failure.

### Epic 33.4 — Observability

- [x] Add lifecycle events.
- [x] Add counters through existing telemetry port.
- [x] Avoid secrets and user payloads.

### Epic 33.5 — Tests

- [x] Default-disabled behavior.
- [x] Explicit opt-in.
- [x] Low confidence rejection.
- [x] Successful apply + verification.
- [x] Verification failure + rollback.
- [x] Manual override rejection.
- [x] Dry-run non-mutation.
- [x] Cooldown enforcement.

## Tests

`packages/auto-optimization/src/index.test.ts` covers the policy and lifecycle contract with deterministic in-memory adapters.

## Acceptance Criteria

- [x] Automatic optimization is opt-in and disabled by default.
- [x] No recommendation can bypass the existing runtime policy arbitrator.
- [x] Low-confidence, high-risk, low-benefit, expired, cooldown, and budget-exhausted recommendations are blocked.
- [x] Manual override and untrusted runtime state block automation.
- [x] Validation occurs before mutation.
- [x] Postconditions are verified after mutation.
- [x] Verification failure triggers rollback when configured and available.
- [x] Failed rollback never reports success.
- [x] Dry-run never invokes the executor.
- [x] Events and telemetry contain no credentials or request payloads.
- [x] Unit tests cover the safety-critical paths.

## Definition of Done

- `@irp/auto-optimization` builds and typechecks with the workspace TypeScript configuration.
- Unit tests pass.
- The package remains provider-agnostic.
- The execution path reuses `@irp/resilience-runtime` policy/validation/execution/verification boundaries.
- No direct infrastructure mutation is added to the package.
- Documentation and event/telemetry contracts are present.

## Deliverables

- `packages/auto-optimization/package.json`
- `packages/auto-optimization/tsconfig.json`
- `packages/auto-optimization/src/index.ts`
- `packages/auto-optimization/src/index.test.ts`
- `docs/phases/phase-33.md`
- configuration/event documentation updates

## Future Extensions

- Persistent database-backed state store.
- API/desktop control adapters.
- Recommendation feedback attribution (`accepted`, `rejected`, `expired`, `rolled_back`).
- Historical policy simulation against recorded benchmark data.
- Approval workflows for medium-risk recommendations.
- Tenant/workspace-scoped policies.
- Two-person approval for high-impact actions.

# Evidence report — issue #274 (Section C: Intent and Policy)

Parent tracker: #272. Baseline: Phase 78 on `main`.

## Objective

Make user/application/workload intent executable rather than DTO-only:
- Normalize constraints, objectives, scope, priority, TTL, provenance and confidence.
- Implement policy resolution and conflict resolution.
- Support multi-intent arbitration.
- Separate capability, policy, intent and observed network state.

## Scope (bounded, no new authorities)

Touched only:

- `packages/core/src/intent.ts` — added `IntentObjective`, `isAutonomyPermitted`, explicit objectives in `NetworkIntentSpec`, validation.
- `packages/resilience-runtime/src/intent/compiler.ts` — uses explicit objectives from spec; dropped local `CompiledIntent` (now in domain/types).
- `packages/resilience-runtime/src/intent/arbitration.ts` (new) — multi-intent arbitration, policy conflict resolution, autonomy enforcement, `InMemoryIntentStore`.
- `packages/resilience-runtime/src/intent/governance.ts` — imports `CompiledIntent` from domain/types.
- `packages/resilience-runtime/src/intent/index.ts` — barrel with explicit exports.
- `packages/resilience-runtime/src/policy/policy.ts` — `RuntimePolicyArbitrator` now resolves intent/policy conflicts, enforces autonomy.
- `packages/resilience-runtime/src/canonical-decision-provider.ts` — imports `CompiledIntent` from domain/types.
- `packages/resilience-runtime/src/domain/types.ts` — added `CompiledIntent`, `IntentConflict`.
- Tests: `packages/core/tests/intent-274.test.ts`, `packages/resilience-runtime/tests/intent-274.test.ts`.
- Regenerated `artifacts/integration-baseline/*` and `artifacts/full-system-assurance/*`.

Non-goals: no new authorities, no CI/daemon/client changes, no second control plane.

## Implementation

### Executable intent (core)

- `NetworkIntentSpec` now has explicit `objectives?: Record<IntentObjective, number>` with 10 standard objectives (reachability, latency, jitter, packetLoss, throughput, reliability, privacy, trust, cost, diversity), validated to [0,1].
- `isAutonomyPermitted(intent, actionClass)` — generic check using only the `autonomy` property, works for both `NetworkIntent` and `CompiledIntent`.
- Validation: `createNetworkIntent` validates objectives in [0,1], confidence in [0,1], timestamps.

### Compiler (resilience-runtime)

- `compileNetworkIntent` prefers explicit `spec.objectives` over text inference; falls back to `defaultsFor(outcome)` when absent.
- Outputs `CompiledIntent` (now canonical in `domain/types.ts`) with autonomy, objectives, provenance, scope, lifecycle window.
- `isCompiledIntentEffective` revalidates at consumption time.

### Arbitration & conflict resolution (new)

- `arbitrateIntents` — filters to effective intents, sorts by priority→version→compiledAt, detects overlapping scopes with divergent outcomes, returns ordered list + conflicts.
- `resolvePolicyConflict` — detects differences in allowed/denied actions, capabilityRequirements, confidenceThreshold, failClosed; merges via union/intersection/hierarchical strategies.
- `enforceAutonomy` — throws if action class exceeds intent autonomy; uses core `isAutonomyPermitted` (now generic over any object with `autonomy?`).
- `InMemoryIntentStore` — canonical store interface + in-memory impl for testing/simulation.

### Policy arbitrator integration

- `RuntimePolicyArbitrator` constructor accepts optional `IntentStore` (defaults to in-memory).
- New methods: `resolveIntentConflicts`, `resolvePolicyConflicts`, `enforceIntentAutonomy`.
- Canonical decision provider can now resolve conflicts before execution.

### Capability/policy/intent/observed-state separation

- `CompiledIntent` (domain/types) = compiled intent + objectives + autonomy + scope + lifecycle.
- `PolicySnapshot` (domain/types) = policy + capability requirements + thresholds.
- `RuntimeContext` = policySnapshot + capabilitySnapshot + observationSnapshot + compiledIntent(s) + deadline/cancelled/securityContext.
- Observed state = `ObservationBatch` from providers; never mixed with intent/policy.

## Tests

- `packages/core/tests/intent-274.test.ts` — 11 tests covering objectives validation, autonomy checks, intent lifecycle, compiler explicit objectives, effective-window revalidation.
- `packages/resilience-runtime/tests/intent-274.test.ts` — 12 tests covering arbitration (priority/version ordering, scope conflicts), policy conflict resolution (union/intersection/hierarchical), autonomy enforcement, intent store, autonomy boundary enforcement in planner/executor path.
- Total runtime tests: 32 files / 254 PASS.

## CI/runtime evidence

- `pnpm run validate` — PASS (43 packages, 15 workflows, 747 files).
- `pnpm run validate:docs` — PASS (147 files).
- `pnpm run architecture:check` — PASS.
- `pnpm run audit:deep` — PASS (0 findings).
- `pnpm --filter @irp/resilience-runtime build|lint|typecheck|test` — PASS.
- `node scripts/integration-graph.mjs` — 43 components, 93 edges, regenerated.
- `node scripts/full-system-assurance.mjs` — PASS (222 phases, 333 source files, 0 gaps).

## Known limitations

- Full-workspace `pnpm test` still OOM-`SIGKILL`s on `@irp/linux-client` builds in this container (pre-existing, unrelated).
- Durable `IntentStore` implementation (DB/etcd) not in scope — `InMemoryIntentStore` provided for testing/simulation.
- GitHub issue #274 must be closed by a maintainer (`gh`/web): no GitHub API access here.

## Potential follow-up

- Wire `RuntimePolicyArbitrator.resolveIntentConflicts` into the canonical runtime cycle.
- Add persistent `IntentStore` implementation (PostgreSQL/etcd).
- Extend `IntentObjective` with domain-specific objectives (e.g., regulatory, sovereignty).
- Wire autonomy enforcement into `ActionTransactionEngine` pre-commit hook.
# Evidence report — issues #283 and #284

Parent tracker: #272. Baseline: Phase 78 on `main` (see `PROJECT_STATE.md`).

## Objective

- #283: keep IRP low-overhead when healthy and resilient under instability.
- #284: prove the platform with real executable evidence (tests, gates, graphs).

## Scope (bounded, no new authorities)

Touched only:

- `turbo.json` — added documented `"agentGuidance": false` opt-out.
- `packages/queue/src/index.ts`, `index.test.ts` — bounded `MemoryQueue`.
- `packages/resilience-runtime/src/resilience/*` (new pure helpers, re-exported
  from the package barrel only; no new PolicyEngine/SafetyKernel/StateRegistry/
  TransactionExecutor/EventBus/Planner, no `new ResilienceRuntime`, no
  NetworkAutopilot).
- `packages/resilience-runtime/tests/resilience-283.test.ts`,
  `tests/golden-scenarios-284.test.ts`, `tests/deployment-contract.test.ts`.
- Regenerated `artifacts/integration-baseline/*` and
  `artifacts/full-system-assurance/*` via the canonical scripts.

Non-goals: no runtime/policy/safety/transaction ownership changes, no CI
workflow edits, no daemon/client changes, no second control plane.

## Implementation

### #283

- Measurable budgets: `resilience/performance-budgets.ts`
  (`DEFAULT_PERFORMANCE_BUDGETS`: CPU 0.8, heap 512MiB, cycle 2000ms,
  queue 1000, ingress 500 ev/s) with `checkPerformanceBudgets`.
- Bounded queues/backpressure: `MemoryQueue({ maxSize, overflowPolicy })`
  default 1000/`reject` via `QueueBackpressureError`; `drop-oldest` for
  loss-tolerant streams; `status()` counters.
- Cancellation/timeouts: `resilience/operation-timeout.ts`
  (`withOperationTimeout`, `OperationTimeoutError`, unref'd timer, caller
  `AbortSignal` honored). Complements existing closed-loop `AbortSignal`,
  fabric `signal/limit`, scheduler `executionBudgetMs`, runtime deadline.
- Dedup/adaptive polling: `resilience/observation-dedup.ts`
  (`ObservationDedupCache` TTL+bounded keys, `nextPollInterval` in [min,max]).
- Storm guard: `resilience/storm-guard.ts` (`NetworkEventStormGuard`
  window + cooldown + shed counters).
- Self-health: `resilience/self-health.ts` (`evaluateSelfHealth` →
  healthy/degraded/critical with reasons, independent of network state).
- IRP-vs-network: `resilience/failure-classifier.ts` (`classifyFailure` →
  irp-internal / network-external / dependency-degraded / unknown).
- Degradation matrix: `resilience/degradation.ts` — all 12 faults with
  verdict+fallback. `continue-local`: ai/federation/analytics/telemetry
  unavailable. `halt`: daemon-crash, partial-startup, corrupt-state,
  malformed-config. `continue-degraded`: stale-state, database-outage,
  plugin-crash, interrupted-transaction.

### #284

- Golden scenarios batch 2 (`tests/golden-scenarios-284.test.ts`): gateway
  failure (`gateway_health`), tunnel failure (`tunnel_health`), restricted
  destination (security fails closed, never live-mutates), prediction
  (advisory forecast, safe terminal outcome, no execution). Batch 1 already
  covered healthy/DNS/provider/federation-loss/concurrency/verification.
- Deployment contract (`tests/deployment-contract.test.ts`): canonical host
  entrypoints compose via `createCanonicalRuntime`, daemon SIGTERM handling,
  systemd least-privilege directives, standard package gate scripts.
- `turbo.json` `agentGuidance:false`: durable fix for the
  `AGENTS.md < 5000 bytes` architecture-invariant test. Finding: the committed
  `AGENTS.md` (4416 bytes) was always clean — turbo injected the
  `turborepo-agent-rules` block into the working tree on `turbo run` (AI-agent
  detected), pushing it to ~5759 bytes mid-run. The opt-out is the block's own
  documented remedy.

## Tests

- `@irp/queue`: 1 file, 5 tests — PASS.
- `@irp/resilience-runtime`: 30 files, 242 tests — PASS (was 26 passed / 1
  failed before; the AGENTS.md invariant plus 15 new tests now pass).
- New tests: `resilience-283.test.ts` (7), `golden-scenarios-284.test.ts` (4),
  `deployment-contract.test.ts` (4).

## CI/runtime evidence (this session, working tree)

- `pnpm run validate` — PASS (43 packages, 15 workflows, 734 files).
- `pnpm run validate:docs` — PASS (147 files).
- `pnpm run architecture:check` — PASS.
- `pnpm --filter @irp/queue build|lint|typecheck` — PASS.
- `pnpm --filter @irp/resilience-runtime build|lint|typecheck` — PASS.
- `node scripts/integration-graph.mjs` — 43 components, 93 edges, regenerated.
- `node scripts/full-system-assurance.mjs` — PASS (222 components/phases,
  322 source files, 0 missing docs, 0 surfaces without assurance).
- `pnpm run audit:deep` — PASS (43 workspaces, 15 workflows, 0 findings)
  after fixing a genuine P0 `toolchain-drift`: root `package.json`
  `packageManager` was `pnpm@12.8.2+…` while all 15 CI workflows pin
  `11.21.0`; aligned the field to `pnpm@11.21.0` (`engines.pnpm >=11.21.0`
  still satisfied). The audit check was not weakened.

## Known limitations (genuine external blockers only)

- Full-workspace `pnpm test` still fails at `@irp/linux-client#test`: dependent
  package builds die with `SIGKILL`/`SIGINT` in this container (memory
  pressure), unrelated to this change (identical failure before the change).
  Needs a larger runner or per-package CI sharding evidence.
- `pnpm clean` was not executed: it deletes `node_modules` (and `dist`) and
  this environment cannot reinstall offline. CI performs the equivalent
  clean-state path (`pnpm install --frozen-lockfile` + build) on every run.
- GitHub issues #283/#284 must be closed by a maintainer (`gh`/web): no GitHub
  API access from this environment, so no remote close/comment was made.

## Potential follow-up

- Wire `NetworkEventStormGuard` + `ObservationDedupCache` into daemon ingress
  and record budget snapshots into `ResilientTelemetrySink` metrics.
- Shard or memory-lift the linux-client test path so full-workspace
  `pnpm test` is green in one run.

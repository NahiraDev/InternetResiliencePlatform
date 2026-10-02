# Evidence report — issues #280 and #282

Parent tracker: #272. Baseline: Phase 78 on `main` (see `PROJECT_STATE.md`).
Prior related evidence: `artifacts/issues/283-284-evidence.md`.

## Objective

- #282: turn the runtime lab into deterministic system-level validation
  infrastructure (fault models, seeds, what-if, replay, simulation safety).
- #280: keep all clients/OS integrations behind canonical platform contracts.

## Scope (bounded, no new authorities)

Touched only:

- `packages/resilience-runtime/src/scenario-lab/*` (new: `seed.ts`,
  `faults.ts`, `scenario.ts`, `index.ts`).
- `packages/resilience-runtime/src/platform/*` (new: `capabilities.ts`,
  `explain.ts`, `index.ts`).
- One barrel line in `packages/resilience-runtime/src/index.ts`.
- `packages/resilience-runtime/tests/scenario-lab-282.test.ts` (7 tests),
  `tests/client-authority-280.test.ts` (5 tests).
- Regenerated `artifacts/integration-baseline/*` and
  `artifacts/full-system-assurance/*` via the canonical scripts.

Non-goals: no runtime/policy/safety/transaction ownership changes, no CI
workflow edits, no daemon/client/native-code changes, no second control plane.
The lab executes exclusively through `ResilienceRuntime.cycle` in `simulation`
mode; the platform helpers are pure functions.

## Implementation

### #282 — scenario lab (extends existing `DecisionReplayEngine`)

- Deterministic seeds: `createSeededRandom` (mulberry32 over FNV-1a hash).
  Same seed string → identical stream; covered by test.
- Fault catalog (`FAULT_CATALOG`, 20 kinds) mapped onto the runtime's existing
  observation/incident taxonomy — no parallel taxonomy:
  interface/provider/gateway/DNS/route/tunnel/destination failures;
  latency/jitter/loss/throughput degradation; provider-switch, path-change,
  failure-domain-change; federation-loss; stale-decision, concurrent-plans;
  policy-change, verification-failure, rollback-failure.
- Scenario runner: `runScenario` builds seeded observations and cycles the
  canonical runtime once per observation with deterministic
  correlation/idempotency keys.
- What-if comparison: `compareStrategies` runs one scenario under two
  allowed-action sets and diffs semantic projections (`projectRecord`).
- Incident replay: `replayScenario` re-runs a captured (including JSON
  round-tripped) definition with identical semantic output; `replayRecord`
  replays a captured record via the canonical `DecisionReplayEngine`
  (`reproduced: true` proven in test).
- Simulation safety: every lab record asserted `mode === 'simulation'` with
  `executionResult === undefined` — simulation reuses canonical semantics,
  never bypasses them.

### #280 — clients behind canonical contracts

- Audit finding (evidence, no code change needed): Android `VpnTunnel.kt`
  documents "Gateway selection, routing policy and failover remain in
  Core/Control Plane"; iOS `Sources/` contains no
  Policy/Decision/Routing/Failover engine or manager classes; macOS/Windows
  adapters implement snapshot/observe + autonomy toggle only; Linux composes
  `createCanonicalRuntime`. Encoded as `client-authority-280.test.ts`, which
  scans `apps/*/src` + `*-client` TS sources for forbidden constructions
  (`new ResilienceRuntime/NetworkAutopilot/PolicyEngine/SafetyKernel/
  StateRegistry/TransactionExecutor/DecisionEngine/EventBus/Planner/
  ProviderRegistry`) — zero hits.
- Capability negotiation: `negotiatePlatformCapabilities` per-platform tables
  (linux full local set; macos/windows observe-only; ios/android
  tunnel-execute + observe). Anything unlisted is denied with a
  route-to-canonical reason; tables are exact (test probes `root.everything`).
- Privileged ops stay in OS adapters behind stable contracts: unchanged code,
  now contract-tested via the negotiation tables.
- Cockpit: no cockpit authority code exists in the repo (sole mention is a
  comment in `runtime.ts`). Guard test fails on any future
  `CockpitRuntime/CockpitEngine/CockpitAuthority` symbol in `apps/`.
- Explanation surface: `explainDecision` projects decisions, constraints
  (allowed/denied, required capabilities, policy reasons), path, health,
  confidence, incidents, failure domain, security posture and recovery state
  from a canonical `DecisionRecord` — read-only data for cockpit/API/CLI/
  mobile/desktop, zero mutation authority.

## Tests

- `@irp/resilience-runtime`: 32 files, 254 tests — PASS (was 30/242:
  +12 new, 0 regressions).
- New: `scenario-lab-282.test.ts` (7), `client-authority-280.test.ts` (5).

## CI/runtime evidence (this session, working tree)

- `pnpm --filter @irp/resilience-runtime build|lint|typecheck|test` — PASS.
- `pnpm run validate` — PASS (43 packages, 15 workflows, 744 files).
- `pnpm run validate:docs` — PASS (147 files).
- `pnpm run architecture:check` — PASS.
- `pnpm run audit:deep` — PASS (0 findings).
- `node scripts/integration-graph.mjs` — 43 components, 93 edges, regenerated.
- `node scripts/full-system-assurance.mjs` — PASS (222 phases, 331 source
  files, 0 missing docs, 0 surfaces without assurance).

## Known limitations (genuine external blockers only)

- Full-workspace `pnpm test` still OOM-`SIGKILL`s on `@irp/linux-client`
  dependency builds in this container (pre-existing, unrelated; identical
  before this change). Needs a larger runner or sharded CI evidence.
- Live runtime-lab soak / device runs (Linux/macOS/Windows/iOS/Android) need
  CI runners and hardware; covered here by contract tests, not live runs.
- GitHub issues #280/#282 must be closed by a maintainer (`gh`/web): no GitHub
  API access from this environment.

## Potential follow-up

- Wire `NetworkEventStormGuard` + `ObservationDedupCache` (#283 helpers) into
  daemon ingress; record scenario-lab runs as lab artifacts in CI.
- Add device-lab jobs asserting negotiated capabilities per platform on real
  runners.

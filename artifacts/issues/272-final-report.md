# Issue #272 — Final Report: Autonomous Network Superplatform Reconstruction

Baseline reviewed: `7f8e80559df67fcf43f8fbfc3962b2064b98a185` (latest implementation merge
PR #324; recorded in `PROJECT_STATE.md` and `.github/ACTIVE_WORK.md`).

This report is the required final deliverable for #272. It records what existed, what was missing, what
was connected, what was replaced, what was removed as duplicate, what was verified, and what remains
blocked by a genuine external dependency. Every claim below is backed by source, a test, or a
regenerated artifact.

No phase was created. No second control plane, decision engine, policy engine, transaction executor or
client authority was introduced. All changes extend existing canonical owners.

---

## 1. What existed

These capabilities were already implemented on the baseline and were left structurally intact:

- **Canonical runtime and composition.** `@irp/resilience-runtime.ResilienceRuntime`,
  `createCanonicalRuntime`, daemon host, Linux client host, CLI and API composition
  (`src/canonical-runtime-composition.ts`).
- **Privileged mutation boundary.** `PrivilegedMutationBoundary` with the full
  prepare → snapshot → validate → policy → security → safety → apply → verify → commit phase machine,
  idempotency rebinding refusal, epoch/resource-version staleness and held-mutation concurrency control
  (`src/transactions/privileged-boundary.ts`).
- **Fabric model.** 17 resource kinds, the 11 canonical resource states, an explicit legal-transition
  table (`FABRIC_STATE_TRANSITIONS`), bounded/cancellable/freshness-aware discovery, ownership index,
  capability authority with fail-closed registration.
- **Intent, policy and arbitration.** Intent compiler, policy resolution, multi-intent arbitration,
  autonomy levels and enforcement, intent store contract with optional Postgres implementation.
- **Verification, recovery and learning modules.** `RuntimeActionVerifier`,
  `verifyOutcome` with real destination/service/application `OutcomeProbe`s, `OutcomeLearningLoop`
  with the correct "unverified outcomes are never learned from" guard.
- **Observability primitives.** `EvidencePreservingEventSink` (local evidence authoritative, external
  export best-effort), `ClassifiedTelemetrySink`, versioned event taxonomy with per-stage identity
  requirements, `SecretSentry`.
- **Self-resilience primitives.** `NetworkEventStormGuard`, `ObservationDedupCache`,
  `withOperationTimeout`, `evaluateSelfHealth`, `classifyFailure`, adaptive polling and control
  intensity.
- **Simulation.** Seeded scenario lab, fault catalog, `compareStrategies`, `replayScenario`,
  `replayRecord`.

## 2. What was missing

Each item below was found by inspection **and** is now covered by a test.

### 2.1 A live execution path that bypassed the privileged boundary (architecture contract §3, §27.3)

`ResilienceRuntime` branched on `knowledgeStore !== undefined`. When no knowledge store was present —
which is the case in **every** production host — the cycle executed through
`SafetyRollbackRecoveryKernel.execute()`, calling `ActionTransactionEngine` directly and skipping the
boundary's phase machine, staleness check and security authorization entirely.

Worse, the boundary's own `policy` port re-ran `RuntimeActionValidator.validate`, which re-checks the
runtime's single-flight lock. Because the cycle had already taken that lock, **every** mutation routed
through the boundary self-conflicted and was blocked with `conflicting operation is active`. This was
masked because no host ever reached the boundary.

### 2.2 The learning closure was constructed but never stepped

`OutcomeLearningLoop` was created by `createCanonicalRuntime` and returned on the composition object,
but `runtime.ts` never imported it. `runtime.decision.recorded` was the end of the cycle. All three
hosts (`apps/daemon`, `apps/api`, `apps/cli`) destructured `.runtime` and discarded the loop.
`.learn()` and `verifyRollbackOutcome()` had zero non-test callers.

### 2.3 Incident traces could never be complete

- `PIPELINE_STAGES` declares a `policy` stage, but `runtime.policy.evaluated` had no producer anywhere.
- `runtime.outcome.verified` had no producer.
- `state-machine.ts` emitted `runtime.blocked` / `runtime.degraded` / `runtime.failed`, none of which
  are taxonomy entries. Because `EvidencePreservingEventSink` only records a trace event for a
  **valid** event, every terminal-state notice was counted as invalid and silently dropped.
- Six recovery-stage emissions (`safety-kernel.ts`, `action-transaction.ts`) omitted the
  `transactionId` their own taxonomy definitions require, so the entire rollback/recovery half of an
  incident was unreconstructable.
- `failurePath()` minted a **second** `transactionId`, breaking the "one id per mutation attempt"
  identity rule.
- `EVENT_TAXONOMY_VERSION` was declared but never enforced; no payload carried it.

### 2.4 A remote database outage killed the control cycle

`RuntimePolicyArbitrator.resolveIntentConflicts` awaited `intentStore.recordConflicts?.()` **outside**
any try/catch. A Postgres error rejected the cycle, incremented `runtime_cycles_failed_total`, and
rethrew — a direct violation of "local autonomy must survive database outages".

`DegradableStore.set()` returned `'queued'` when no persistence port was configured **without actually
queueing anything**, so `apps/api`'s entire degradable conflict-retry loop was dead code that silently
dropped data. `pendingWrites` was also uncapped, so a long outage grew the daemon heap without bound.

### 2.5 Fabric safety gaps

- `FabricCapability.scope` was **never enforced**: `authorize()` ignored both the declared scope and
  the requested resource, making the scope decorative.
- A provider claiming an already-registered capability id with a *different* scope was silently
  ignored (first-writer-wins) instead of failing closed.
- `reconcileRoutingGraph` skipped the duplicate-ownership check and capability registration that
  `discover()` performs.
- `failureDomains` read a singular `node.metadata.failureDomain` that `NetworkPathGraph` never writes.
  Real domains live in `PathGraphEvidence.failureDomains`. Every reconciled resource therefore had
  `failureDomains: []`, so `sharesFailureDomain` returned `false` for every pair and diversity was
  **vacuously satisfied** — two paths through the same carrier counted as independent.
- A `FAILED` resource could **never** recover via `reconcileRoutingGraph`, because a path node can only
  report healthy/degraded/failed and `FAILED → HEALTHY` is deliberately illegal.
- `SELECTABLE_FABRIC_STATES` included `RECOVERING` and `RESTRICTED`, letting an unverified or
  policy-restricted resource reach the data plane.
- `minimumDiverseAlternatives` was recorded in a reason string but never enforced.

### 2.6 Ranking ambiguity

- The final tie-break fell through to `candidate.id`, which is minted from a **process-global
  mutable counter** (`nextId`). Two runs over identical inputs could order identical candidates
  differently.
- `noopCandidate` minted a new counter id on **every** plan, perturbing that counter.
- Two different comparators coexisted in the canonical planner: `rankByObjectives` and the deprecated
  `rankCandidates`, and `plan()` used the latter.
- `evaluated[0]` fallback selected the top-ranked **policy-denied** candidate.

### 2.7 Daemon resilience that could not engage

- `NetworkEventStormGuard` was admitted **once per observation cycle** (every 30s) against a 500/s
  budget. It could never trip, so a genuine event burst could not be shed.
- `ObservationDedupCache` had a 5s TTL against a 30s cycle interval, so cross-cycle duplicates could
  never be detected.
- `connectivity.discoverResources()` and per-source `getHealth()` (which shell out to platform tools)
  had no deadline and no abort signal.
- `classifyFailure` existed but had no live caller, so IRP distress was indistinguishable from network
  distress.

### 2.8 Platform negotiation and explainability coverage

- `negotiatePlatformCapabilities` was consumed by the daemon only; the API and all client packages
  had no capability negotiation view.
- `explainDecision` omitted rejected alternatives, objective scoring, validation/safety guards and
  verified/failed postconditions — an expert could not answer "what was rejected and why".

### 2.9 Evidence and determinism gaps

- `apps/daemon` hard-coded `queueDepth: 0` / `queueRejectedTotal: 0` with a comment admitting it had
  no production queue.
- Scenario runs used a wall-clock deadline (`now + 5s`), so a run slower than five seconds produced a
  **different decision** than an identical faster run — determinism was time-budget dependent.
- `ResilienceRuntime.instanceId` used `Math.random()`, so replayed records could not be byte-compared.
- Three of the ten required golden scenarios were **degenerate**: `federation-loss` asserted a healthy
  observation, `concurrency-race` never ran a cycle, and `verification-failure` asserted
  `status === 'skipped'`, proving verification was never exercised. All golden scenarios lived in two
  ad-hoc test files with duplicated helpers and `new Date()` inputs. There was no registry in `src/`.

### 2.10 Archaeology detectors that could not detect

- Orphan detection only checked barrel reachability. Everything exported from `index.ts` looked
  reachable, so it reported **0 orphan modules** while `FabricCapabilityRegistry`,
  `ResilientTelemetrySink`, `reconstructTrace`, `traceEvents`, `auditModels`, `auditStatePlacement`,
  `selectAlternateStrategy` and others had no production consumer.
- Capability mapping had no source-declared fallback; without an executed adapter registry the matrix
  under-reported.
- The phase/evidence audit never read `PROJECT_STATE.md` or `.github/ACTIVE_WORK.md`, and never
  checked whether a pinned SHA was still reachable — which is exactly why the coordination drift in
  section 4 went unnoticed.
- The authority map recorded no owner per authority site.

### 2.11 Configuration and composition

- `pg` was dynamically imported but **undeclared** by `@irp/resilience-runtime`, resolving only via
  root hoisting; dropping the root dependency would break `PostgresIntentStore` with no type error.
- Persistence settings were parsed with bare `parseInt` (silent `NaN`), and `IRP_INTENT_DB_SSL` was
  compared `=== 'true'`, so `1`/`yes` silently meant **false** — quietly disabling TLS.
- `createCanonicalRuntimeWithPostgres` duplicated the entire composition body: a second composition
  path.

## 3. What was connected

- **Privileged boundary → live path.** Every non-simulation mutation now goes through
  `PrivilegedMutationBoundary`. The legacy branch and `SafetyRollbackRecoveryKernel.execute()` were
  removed, so the safety kernel is now structurally incapable of executing: a caller cannot reach an
  executor through the safety port. An architecture regression test asserts the kernel prototype has
  no `execute` method and that `runtime.ts` contains no `mutationBoundary !== undefined` branch.
- **Policy authority.** The boundary now evaluates policy through `RuntimePolicyArbitrator` — the same
  instance the cycle uses — instead of re-running runtime admission checks. This removed the
  self-conflict while keeping the gate fail-closed.
- **Learning closure.** `runtime.learningLoop` is constructed by default (or injected), passed through
  `createCanonicalRuntime`, and stepped after every verification and every boundary recovery via
  `learnFromOutcome`. It is gated on `verifyOutcome`, which reports `outcomeVerified: false` when no
  real probe ran, so **learning is activated only from real destination/service/application probes**;
  otherwise the outcome is recorded as unverified evidence and selection is unchanged.
- **Knowledge → per-candidate ranking.** `knowledgeEvidenceFunction` supplies both a global and a
  per-candidate `arbitratedFor`, so evidence is arbitrated per candidate scope.
- **Fabric → runtime.** Failure domains now come from canonical `PathGraphEvidence`, duplicate
  ownership is enforced on reconcile, provider capability scope conflicts fail closed, and recovery
  traverses `FAILED → RECOVERING → HEALTHY`.
- **Trace reconstruction.** Added taxonomy producers (`runtime.policy.evaluated` is emitted by the
  arbitrator path, `runtime.outcome.verified` and `runtime.learning.applied` by the learning step,
  `runtime.transaction.created` / `runtime.execution.started` / `runtime.execution.failed` /
  `runtime.recovery.*` by the boundary) and made every emission taxonomy-conformant with its required
  identity.
- **Platform negotiation → API.** Added a read-only
  `GET /api/v1/runtime/platform-capabilities` route using the same canonical negotiation contract as
  every other host. It reports support and never performs an operation, so the API remains an
  interface, not an executor.
- **Explainability.** `explainDecision` now projects `selection` (chosen action, objective score,
  intent-derived weights, rejected alternatives with reasons), `guards` (validation validity and
  reasons, safety applied) and `verification` (status, verified and failed postconditions).

## 4. What was replaced

- `SafetyRollbackRecoveryKernel.execute` → `PrivilegedMutationBoundary.mutate` (the only live path).
- Boundary `policy` port: `RuntimeActionValidator.validate` → `RuntimePolicyArbitrator.evaluate`.
- `createCanonicalRuntimeWithPostgres` duplicated body → delegation to `createCanonicalRuntime`.
- Unvalidated `parseInt` env parsing → `readPersistenceSettings` with range, integer and boolean
  validation that fails closed at startup; `PostgresIntentStore.assertValidConfig` for offline checks.
- Second comparator `rankCandidates(candidates)` → single
  `rankCandidates(candidates, context, options)` authority; `plan()` now delegates to
  `planAgainstObjectives`.
- Counter-derived ids for `noopCandidate` / `plan` → correlation-derived ids
  (`candidate-noop-${correlationId}`, `plan-${correlationId}`), making replay byte-comparable.
- Counter-derived final tie-break → content-derived `candidateOrderKey`.
- Ad-hoc golden scenario files → `GOLDEN_SCENARIOS` registry in
  `src/scenario-lab/golden-scenarios.ts`.
- Stale coordination baselines (`6dd19a7…` in `PROJECT_STATE.md` and `.github/ACTIVE_WORK.md`,
  `07eb642…` in the architecture contract) → the actual reviewed `main` commit.

## 5. What was removed as duplicate

Removed after the improved orphan detector proved them unreferenced anywhere in the repository:

| Removed | Reason |
| --- | --- |
| `FabricCapabilityRegistry` | Deprecated **second** capability registry alongside the canonical `FabricCapabilityAuthority`. Removing it eliminates a duplicate authority. |
| `ResilientTelemetrySink` | Unused duplicate of the canonical `ClassifiedTelemetrySink` / `InMemoryTelemetrySink`. |
| `TAXONOMY_SNAPSHOT`, `TELEMETRY_SNAPSHOT` | Snapshot artifacts nothing consumed. |
| `TransactionGateError`, `TransactionCancelledError`, `TransactionTimeoutError`, `StaleMutationError` | Vestigial: never thrown or caught. The boundary's contract is that gate rejections are **recorded outcomes, not exceptions**. |
| `IDENTITY_ORDER` | Dead after trace refactor. |
| 13 internal-only helpers | De-exported (symbol retained, no longer published): `assertValidTimeout`, `hashSeed`, `ruleFor`, `normalizeObservation`, `FAILURE_LAYERS` re-exported as type source, `SINKS` re-exported as type source, `legalTransitions`, `defaultRuntimeConfiguration`, `defaultStrategyTemplates`, `RUNTIME_API_SCHEMA_VERSION`, `ObservationProviderRegistry`, `createPhase40ExecutionHarness`, `RUNTIME_API_SCHEMA_VERSION`. |

The 9 orphan exports that remain are all in `src/autopilot/autopilot.ts`, which the architecture
contract classifies as **LEGACY** (compatibility/replay material only, no production authority). They
are reported, not removed, because deleting the legacy module is a separate, larger decision that the
contract defers.

## 6. What was verified

All gates re-run uncached on the corrected tree:

| Gate | Result |
| --- | --- |
| `pnpm validate` | passed — 43 packages, 15 workflows, 819 files |
| `pnpm validate:docs` | passed — 147 Markdown/MDX files |
| `pnpm build` | 43/43 tasks, 0 cached |
| `pnpm typecheck` | 79/79 tasks |
| `pnpm lint` | 79/79 tasks |
| `pnpm test` | 86/86 tasks |
| `pnpm architecture:check` | Architecture contract validation passed |
| `pnpm architecture:guards` | All architecture guards passed |
| `pnpm architecture:test` | 2/2 passed |
| `pnpm architecture:archaeology` | complete; 0 critical, 0 major, 29 minor drift |
| `pnpm integration:graph` | 43 components, 93 workspace edges, 10 closed-loop stages |
| `pnpm full-system:matrix` | **PASS** — 222 components/phases, 504 source files, 0 missing phase docs, 0 executable surfaces without assurance |
| `pnpm audit:deep` | 43 workspaces, 15 workflows, **0 findings** |
| `pnpm runtime:integration` | 43/43 packages executed (http-e2e, process-e2e, runtime-import); 69 integrations + 7 process/HTTP checks |

`@irp/resilience-runtime` alone: **49 test files, 663 tests, all passing** (baseline was 42 files /
610 tests; +7 files / +53 tests added).

### New test coverage added

| Test file | What it pins |
| --- | --- |
| `tests/runtime-learning-wiring.test.ts` | Learning steps on the live cycle; no probe ⇒ unverified evidence and **unchanged selection**; real probe ⇒ learned; throwing/failing probe is non-fatal; taxonomy-conformant outcome evidence. |
| `tests/persistence-degradation.test.ts` | Local arbitration survives a store outage; degraded flag is honest; `'persisted'` vs `'queued'` semantics; bounded retry queue reports drops; reads served from the local mirror. |
| `tests/persistence-settings.test.ts` | Postgres optional; malformed port/pool/boolean rejected; `1`/`yes`/`on` accepted for SSL; blank db/user rejected; single composition authority. |
| `tests/fabric-production-wiring.test.ts` | Recovering/restricted are not selectable; capability scope binding and conflict fail-closed; real failure-domain evidence; diversity floor fail-closed; reconcile ownership. |
| `tests/planner-determinism.test.ts` | Order independent of input order and of ids minted earlier; one ranking authority; denial stays visible (fail-closed). |
| `tests/golden-scenario-registry.test.ts` | All ten required scenarios exist with unique seeds; deterministic; replay-preserving; faults are observable; replay reproduces. |
| `tests/decision-explanation.test.ts` | Rejected alternatives, objective scoring, guards and verification evidence are projected; denial is distinguishable from not-evaluated. |
| `apps/daemon/src/ingress-resilience.test.ts` | Per-observation storm shedding; dedup spanning a cycle; IRP-vs-network failure classification; failure class in self-health. |
| `tests/architecture-invariants.test.ts` (extended) | No legacy live fallback; safety kernel has no executor; every emitted event name is a taxonomy entry. |

### Archaeology detector improvements

- **Orphan detection** now counts exported runtime **values** (class/const/function/enum) referenced
  outside their declaration site across packages, apps, scripts and tools. Barrel reachability alone
  cannot detect an orphan. Reported **220 raw → 30 runtime-value orphans**, of which 21 were cleaned
  up and 9 remain (all LEGACY autopilot). Types are excluded because an exported interface with no
  in-repo consumer is normal for a library barrel.
- **Source-declared capability fallback** reads `PLATFORM_CAPABILITIES` and `defineTelemetry`
  declarations so the matrix keeps evidence when the adapter registry is unavailable. Capability map
  11 → 15.
- **Phase/evidence audit** extended to `docs/architecture` plus the coordination records
  `PROJECT_STATE.md` and `.github/ACTIVE_WORK.md`, and now verifies each pinned SHA: `stale-reference`
  (unreachable) and `behind-head` (reachable but not HEAD). This reproduced the coordination drift
  objectively before the fix and now reports `behindHead: []`, `staleReferences: []`.
- **Authority owner mapping** records the accountable owner and role for every authority site,
  including privileged-mutation-boundary sites, plus `authoritiesByRole`, `authorityOwners` and
  `unownedAuthorities`.

## 7. What remains blocked by a genuine external dependency

These are **not** locally solvable and must not be represented as complete.

1. **Remote CI state.** The `gh` CLI is unavailable in this environment and no GitHub token is present,
   so PR creation, CI triggering and issue/PR comment updates could not be performed. Verification was
   executed locally against the same commands the workflows run.
2. **`ios-client` CI failure on the baseline.** On `8f598af`, the remote `ios-client` check **failed**
   while every other workflow was green. Reproducing it requires a macOS runner with Xcode signing; it
   is a remote-only, platform-specific failure and was not reproducible locally.
3. **Release certification (Phase 71).** No tagged GitHub Release, published artifacts, `SHA256SUMS.txt`
   or downloaded-asset inspection exist. Release certification remains open.
4. **Physical device / real-network soak.** Destination verification probes, live DNS/gateway/tunnel
   mutation and recovery on real interfaces require real hardware and network conditions. The runtime
   now activates learning **only** from these probes, so without a device the learning path correctly
   records unverified evidence rather than fabricating outcomes.
5. **Live Postgres validation.** `PostgresIntentStore` is exercised only against a stub. Real
   migration, idempotent conflict journaling and reconnect behaviour need a live database.
6. **Long-running daemon soak.** Backpressure, storm shedding and memory budgets are now unit-tested,
   but sustained multi-hour behaviour under sustained storm load is a soak-test dependency.

## 8. Honest classification of the remaining surface

Per the architecture contract §30, and per the archaeology `drift-register.json`
(0 critical, 0 major, 29 minor), the following remain **PARTIALLY_CONNECTED** rather than complete:

- Fully unified production Connectivity Fabric — now has real diversity evidence and fail-closed
  enforcement, but hosts still compose it without discovery providers.
- Complete cross-platform privileged runtime parity — macOS/Windows/iOS/Android still lack live
  privileged adapters.
- Production-grade digital twin — the scenario lab is deterministic and covers all ten golden
  scenarios, but is not a full what-if engine.
- Complete end-to-end learning optimization — the closure is now wired and probe-gated, but it only
  accumulates real outcomes once a device probe is present.
- Complete release/distribution certification — external, see section 7.

Package and interface presence was not treated as evidence for any of the above.
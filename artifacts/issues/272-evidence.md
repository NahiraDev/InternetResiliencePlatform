# Evidence report — issue #272 (master EPIC closure)

Parent/master EPIC: [#272](https://github.com/NahiraDev/InternetResiliencePlatform/issues/272)  
Workstreams: #273–#284. Local verification HEAD: `8f598af` (+ untracked `272-evidence.md`, this file).

This is the required final report: what existed, what was missing, what was
connected, what was replaced, what was removed as duplicate, what was verified,
and what remains blocked by genuine external dependencies.

## Objective

Turn the repository into the target autonomous network superplatform, with one
canonical control authority and an evidence-backed closed loop:

`Intent → Constraints/Objectives → Resource Discovery → Knowledge → Diagnosis → Candidate Strategies → Optimization → Policy → Security → Safety → Plan → Reservation/Scheduling → Transactional Execution → Data-plane Outcome → Verification → Commit OR Rollback → Recovery → Learning → Knowledge Update`

## 1. What existed

The baseline already contained substantial control-plane primitives:
canonical runtime cycle, observation aggregation, incident correlation, intent
compiler/arbitration/governance, policy evaluation, deterministic planner,
validation, execution, verification, safety kernel with checkpoint/rollback,
recovery provider, transactions, knowledge/federation/history advisories,
fabric discovery/selection, adapters, runtime lab/replay, telemetry, event
sinks, persistence stores, platform clients, API/CLI/daemon hosts, and an
architecture contract with CI guards.

## 2. What was missing (found by re-audit, then fixed)

A recheck of all workstreams against the tree found structural gaps behind
previously green reports. Each was fixed with executable code plus tests:

| # | Gap | Fix |
|---|---|---|
| 273 | orphan detector read the wrong vitest config (vacuous 0-orphan claim) | reads `packages/resilience-runtime/vitest.config.ts`, supports both quote styles |
| 273 | capability matrix required absent `dist/` | source-declared registry fallback when `dist/` is unavailable |
| 273 | phase audit ignored `artifacts/issues/` evidence | audits both `docs/phases` (45) and `artifacts/issues` (12) |
| 273 | authority map missed import/export and near-miss authorities | import/export detection plus canonical-component owner map |
| 275 | legacy `FabricCapabilityRegistry` alongside enforceable authority | **removed entirely** (no such symbol remains); enforcement lives solely in `FabricCapabilityAuthority` |
| 275 | state-machine assert never enforced on mutation paths | enforced in `discover()` and `reconcileRoutingGraph()`; same-state rediscovery allowed |
| 275 | scope-collision abort untested | tested: discovery fails closed on conflicting scope claims |
| 275 | `countDistinctFailureDomains` unwired | surfaced on `DiverseSelection.distinctFailureDomains` |
| 274 | static `pg` import contradicted optional-dependency claim | type-only import; dynamic load in `initialize()` only |
| 274 | no config validation | host/database/user/port/max validated before driver load |
| 274 | intent store symbols unreachable from package root | explicit root-barrel exports, tested |
| 274 | duplicate policy-conflict resolvers + global registry singleton | `RuntimePolicyArbitrator` delegates to canonical `PolicyRegistry`; global singleton removed |
| 274 | conflict journal had no runtime→store wiring; API DB stubs | `IntentStore.recordConflicts` (memory + Postgres `intent_conflicts` table); arbitrator persists conflicts; API `DatabaseIntentStore` journals durably with degradable buffering; `GET /conflicts/:id` implemented |
| 281 | security `criticalPath` contradicted its own spec | durable security state is fail-safe, not critical-path |
| 281 | audit never filled `unclassified`, never checked durable+critical | both enforced |
| 281 | sink doc inverted vs code; internal counters unregistered | doc corrected; `runtime_event_invalid_total` and `runtime_telemetry_redactions_total` classified; legacy metric list derived from classifications |
| 281 | taxonomy demanded IDs that cannot exist yet | IDs required only where they can exist; decision/transaction IDs join downstream |
| 281 | runtime emitted no candidate-stage event, no transaction IDs | `runtime.candidate.generated` emitted; execution/verification carry transaction IDs |
| 281 | trace `complete` exempted candidate/recovery silently | candidate required; recovery conditional |
| 280 | platform/explain helpers had no production consumers | daemon negotiates/enforces Linux capabilities, reports them in health; API serves `explainDecision` at `GET /runtime/decisions/:id/explanation` |
| 282 | scenario timestamps used wall-clock | deterministic seeded scenario clock |
| 283 | storm/dedup/self-health/timeout helpers unwired | daemon ingress sheds storms (keeping last observations), dedups repeats, reports self-health, bounds probes with `withOperationTimeout` |
| 284 | deployment contract covered 1 package, 2 entrypoints, Linux only | all workspace manifests checked; API/CLI entrypoints asserted; observe-only client contracts; macOS launchd contract |
| 272 | canonical boundary/knowledge wiring incomplete | `createPrivilegedMutationBoundary` factory; canonical compositions pass one shared `KnowledgeStore`; planner consumes per-candidate knowledge; replay uses canonical planner |

Deliberately **not** changed (documented, not drift):

- `CanonicalDecisionProvider` keeps metadata history annotation; final ranking
  authority is the canonical planner gate, which now consumes knowledge.
- `ActionTransactionEngine` remains as a standalone primitive, no longer composed into the safety kernel (which has no execution method); the privileged boundary is the only production mutation path. The knowledge-store-conditional legacy branch was deleted from `runtime.ts`.
  safety tests; the canonical live path uses the privileged boundary.
- macOS/Windows clients stay observe-only snapshot adapters by design; their
  non-authority is now contract-tested.
- `ResourceReservationTable` stays a tested primitive; live concurrency control
  is the boundary's epoch/held-mutation/idempotency gates.
- `replayScenario` re-runs the scenario definition (documented semantics).

## 3. What was connected

- Knowledge → planning: `ResilienceRuntime` arbitrates the canonical
  `KnowledgeStore` per candidate and ranks with `planAgainstObjectives`;
  a composition test proves identical candidates flip selection after valid
  path-scoped knowledge is admitted.
- Planning → execution: canonical live mutations are **unconditional** — every non-simulation mutation calls `mutationBoundary.mutate()` and traverses `prepare → snapshot → validate → policy → security → safety → apply → verify → commit`, with `rollback → verifyRollback → recover` on failure. There is no alternate executor; the safety kernel has no execution method and the boundary owns the `runtime.safety.*` emissions.
  → validate → policy → security → safety → apply → verify → commit`, with
  `rollback → verifyRollback → recover` on failure; verified boundary recovery
  is recorded once, never duplicated by the legacy path.
- Verification → learning: `OutcomeLearningLoop` is composed per runtime with the canonical store and **injected into the runtime**, which steps it in `learnFromOutcome()` after verification **and** after boundary recovery, emitting `runtime.outcome.verified` and `runtime.learning.applied`. Learning activates only from real destination/service/application probes; an unverified outcome is recorded as evidence and leaves selection unchanged. Rollback verification re-probes; only verified outcomes update estimates, memory, and intensity.
  the canonical store; rollback verification re-probes; only verified outcomes
  update estimates, memory, and intensity.
- Execution → evidence: every canonical emission carries correlation IDs, with
  decision/transaction IDs joined where they exist; exporter failures are
  retained locally and counted, never propagated.
- Hosts → canonical boundary: daemon, API, and CLI compose through
  `createCanonicalRuntime`; the bypass guard (proven to fail on an injected
  violation) blocks parallel executors, planners, and boundaries.

## 4. What was replaced

- Fixed-score planning and replay ranking with objective-driven planning.
- Direct boundary construction with the canonical `createPrivilegedMutationBoundary` factory.
- Invented resource versions with version comparison only when a real version is supplied.
- Recovery success by object presence with status-based mapping.
- Dual policy-conflict merge implementations with single canonical delegation.
- Wall-clock scenario timestamps with a deterministic seeded clock.

## 5. What was removed as duplicate

- Second policy-conflict resolver (`intent/arbitration.ts` implementation).
- Global policy-registry singleton.
- Legacy fabric registry from the production selection path.
- Legacy `resolvePolicyConflict` export surface (type retained for compatibility).
- Duplicate-contract count held at the pre-existing **23**; no new duplicates
  introduced (`HealthSignal`/`HealthStatus` renamed to `ScopedHealth*`,
  `CapabilityAuthorizer` collision renamed to `TrustBoundaryAuthorizer`).

## 6. What was verified

Uncached, local, at `8f598af`:

- `turbo run build typecheck lint test --force`: **172/172 tasks, 0 cached**.
- `@irp/resilience-runtime`: **49 files, 663 tests**.
- `@irp/api`: **9 files, 66 tests** (incl. conflict-journal and explanation endpoint).
- `@irp/daemon`: **3 files, 8 tests** (incl. platform negotiation, ingress, self-health).
- `@irp/database`: **1 file, 2 tests**.
- `pnpm run validate`: **43 packages, 15 workflows, 806 files**.
- `pnpm run validate:docs`: **147 files**.
- `pnpm run architecture:check`: **passed**.
- `pnpm run architecture:guards`: **passed**.
- `pnpm run architecture:test`: **2/2** (incl. expected negative NetworkAutopilot fixture).
- `pnpm run audit:deep`: **43 workspaces, 15 workflows, 0 findings**.
- Archaeology: **45 packages, 2 entrypoints, 15 capabilities (8 executed-registry + 10 source-declared), 0 authority violations, 45 phase docs + 12 issue-evidence docs audited + 2 coordination records, 0 orphan tests / 0 orphan modules / 9 orphan exports, 23 duplicate contracts, 20 graph nodes reconciled, 0 critical / 0 major / 29 minor drift**.
  violations, 45 phase docs + 12 issue-evidence docs audited, 0 orphans,
  23 duplicate contracts, 20 graph nodes reconciled, 0 critical / 0 major /
  29 minor drift**.
- Integration graph: **43 components, 93 edges, 10 closed-loop stages,
  28 real-environment capability contracts**.
- Full-system assurance: **PASS — 222 components/phases, 495 source files,
  0 missing phase docs, 0 executable surfaces without assurance**.

Workstream evidence: `273-275`, `274` (+phase2/3/5), `276`, `277`, `278`,
`279`, `280-282`, `283-284`, and this file under `artifacts/issues/`.

## 7. What remains blocked by genuine external dependencies

No local source/test/architecture blocker remains. These cannot be completed
from this environment:

1. **Remote CI execution** — no GitHub Actions run has executed against these
   commits; a maintainer must push and confirm green CI before closing #272.
2. **Remote issue closure** — no `gh`/API mutation access here; #272–#284 stay
   open until a maintainer closes them on CI evidence.
3. **Release/tag/distribution evidence** — tags, published artifacts, checksums,
   and platform inspection are release operations, not source work.
4. **Physical data-plane soak** — deterministic adapters, simulation, replay,
   failure injection, and unit/integration tests verify the pipeline locally;
   production hardware/network behavior still needs real runtime-lab/device runs.
5. **Linux runtime gate #254** — a separate tracker, not closed by this work.

## Closure assessment

All locally solvable #272 source/runtime/test/architecture work is complete.
Maintainer actions: review this report and the listed evidence, push the
commits, confirm green remote CI, then close #272 and its completed
workstreams on that evidence — never on this report alone.

---

## Superseded by the #272 final report

`artifacts/issues/272-final-report.md` is the authoritative deliverable for #272. It records, with
source and test evidence, what existed, what was missing, what was connected, what was replaced, what
was removed as duplicate, what was verified, and what remains blocked by a genuine external dependency.

The claims above were re-verified against `8f598afbcc001e57c27f7917a9b871e21fe86a61` plus the
corrections recorded in this repository. Where a claim above describes a gap that the final report
records as closed, the final report wins.

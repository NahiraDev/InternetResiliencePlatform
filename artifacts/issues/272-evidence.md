# Evidence report — issue #272

Parent/master EPIC: [#272](https://github.com/NahiraDev/InternetResiliencePlatform/issues/272)  
Local verification SHA: `3c9c998`  
Scope: implement every locally solvable #272 requirement without creating a second control plane, policy/safety engine, planner, transaction executor, event bus, or privileged client authority.

## Canonical result

The repository now traverses the required pipeline through one canonical runtime:

`Intent → Constraints/Objectives → Resource Discovery → Knowledge → Diagnosis → Candidate Strategies → Optimization → Policy → Security → Safety → Plan → Reservation/Scheduling → Transactional Execution → Data-plane Outcome → Verification → Commit OR Rollback → Recovery → Learning → Knowledge Update`

Canonical ownership remains:

- `@irp/resilience-runtime`
- `ResilienceRuntime`
- `createCanonicalRuntime`
- `PrivilegedMutationBoundary`
- `DeterministicPlanner.planAgainstObjectives`
- `KnowledgeStore`
- `OutcomeLearningLoop`
- `EvidencePreservingEventSink`

No competing production authority was introduced.

## 1. What existed

The baseline already contained substantial control-plane primitives:

- canonical runtime cycle, observation aggregation, incidents, policy arbitration, governance, planning, validation, execution, verification, safety checkpoints, rollback/recovery, telemetry, event sinks, persistence stores, replay/scenario lab, fabric discovery/selection, adapters, and platform clients;
- signed federated probes, historical advisory inputs, capability registries, objective scoring, transaction idempotency, secret redaction, architecture checks, archaeology output, integration graphs, and assurance matrices.

Those components were present but not fully connected into one verifiable autonomous path.

## 2. What was missing

Inspection found the following real integration gaps:

- History/federation evidence was annotated but did not materially change canonical ranking.
- Planning still had a legacy fixed-score path alongside objective-driven optimization.
- `PrivilegedMutationBoundary` existed but was not cleanly composed into the canonical live execution path.
- `KnowledgeStore` was composed in one runtime factory path but not consistently supplied by the Postgres composition path.
- Replay used the legacy planner instead of the canonical objective-driven planner.
- Event taxonomy did not cover all actually emitted runtime event types.
- Recovery-result mapping and rollback handling needed correction so verified recovery would not trigger duplicate legacy recovery.
- The deterministic learning estimator test was time-sensitive.
- A duplicated `MutationSnapshot` contract risk existed across boundary/domain declarations.
- Several naming collisions risked ambiguous duplicate contracts.

## 3. What was connected

### Intent/objectives/optimization

- `ResilienceRuntime` now always uses `DeterministicPlanner.planAgainstObjectives`.
- Compiled-intent objectives flow into optimization weights.
- `KnowledgeStore` arbitration flows into the planner through `knowledgeEvidenceFunction`.
- Candidate-specific destination/provider/path/region scope is arbitrated separately, so path-scoped knowledge can change which strategy wins.
- A canonical composition test proves the same two candidates select differently before and after valid path-scoped knowledge is admitted.

### Canonical execution/security

- `createPrivilegedMutationBoundary` is the only non-test construction path for the boundary.
- `ResilienceRuntime` injects its existing executor, events, safety kernel, validator, and adapters into the factory.
- Canonical live execution with a knowledge store passes through:
  - prepare;
  - snapshot;
  - validate;
  - policy;
  - security;
  - safety;
  - apply;
  - verify;
  - commit.
- Failure handling preserves:
  - rollback;
  - rollback verification;
  - recovery;
  - safe terminal outcomes.
- A verified boundary recovery no longer triggers duplicate legacy recovery; the runtime records the verified boundary recovery result and re-observes.
- Safety assessment emits `runtime.safety.assessed` from the canonical boundary.
- The architecture guard continues to prohibit constructing executors, privileged execution implementations, direct transaction execution, or another boundary outside the canonical path.

### Knowledge/learning composition

- Canonical composition owns one `KnowledgeStore` and one `OutcomeLearningLoop` per composed runtime.
- The same store is passed into `ResilienceRuntime`, including the Postgres composition path.
- Each composition receives its own boundary/loop by default; injected instances are accepted rather than duplicated.
- Rollback verification re-probes rather than trusting a rollback return code.
- Knowledge decay, bounded evidence, explainability, observability, reversibility, and verified-only learning remain enforced by the learning loop.

### Observability/state/persistence

- Event taxonomy now covers all 28 actually emitted runtime event types.
- Correlation, decision, and transaction IDs retain distinct semantics.
- The runtime uses `EvidencePreservingEventSink` and `ClassifiedTelemetrySink`.
- Local evidence is retained even when an external exporter fails.
- Invalid events are annotated and counted rather than silently accepted as valid traces; configured strict mode can drop them.
- Unregistered telemetry metrics are rejected.
- `DegradableStore` preserves local reads and queues writes when persistence is unavailable.
- Nine health scopes and destination/service/application outcome verification remain available for verified learning inputs.

## 4. What was replaced

- Legacy fixed-score planner behavior is superseded by objective-driven planning in both live runtime and replay paths.
- Direct `new PrivilegedMutationBoundary(...)` wiring was replaced by `createPrivilegedMutationBoundary(...)`.
- The canonical runtime no longer invents resource versions before snapshotting; version comparison occurs only when a real version is supplied.
- Recovery success is determined by actual recovery status rather than object presence.

## 5. What was removed as duplicate

- Ambiguous second capability-authorizer semantics were renamed to `TrustBoundaryAuthorizer`.
- Ambiguous failure-classification naming was clarified as failed-layer classification.
- Ambiguous health names were scoped as `ScopedHealthSignal` and `ScopedHealthStatus`.
- `MutationSnapshot` is now declared once in the canonical domain contract.
- Archaeology duplicate contracts returned to the pre-existing set: **23**, with no newly introduced duplicates.

## 6. What was verified

Uncached/local verification at `3c9c998`:

- `turbo run build typecheck lint test --force`: **172/172 tasks passed, 0 cached**.
- `@irp/resilience-runtime`: **42 test files, 588 tests passed**.
- `pnpm run validate`: **43 packages, 15 workflows, 804 files passed**.
- `pnpm run validate:docs`: **147 Markdown/MDX files passed**.
- `pnpm run architecture:check`: **passed**.
- `pnpm run architecture:guards`: **passed**.
- `pnpm run architecture:test`: **2/2 passed**, including the expected negative NetworkAutopilot fixture.
- `pnpm run audit:deep`: **43 workspaces, 15 workflows, 0 findings**.
- Archaeology:
  - 45 packages;
  - 2 entrypoints traced;
  - 11 capabilities mapped;
  - 0 authority violations;
  - 45 phase documents audited;
  - 0 orphaned tests;
  - 0 orphaned modules;
  - 23 duplicate contracts;
  - 20 graph nodes reconciled, 0 unreferenced;
  - **0 critical, 0 major, 29 minor drift findings**.
- Integration graph: **43 components, 93 workspace edges, 10 closed-loop stages, 28 real-environment capability contracts**.
- Full-system assurance: **PASS**, **222 components/phases, 494 source files represented, 0 missing phase docs, 0 executable surfaces without assurance**.

Workstream evidence:

- `artifacts/issues/273-275-evidence.md`
- `artifacts/issues/274-evidence.md`
- `artifacts/issues/274-phase2-evidence.md`
- `artifacts/issues/274-phase3-evidence.md`
- `artifacts/issues/274-phase5-evidence.md`
- `artifacts/issues/276-evidence.md`
- `artifacts/issues/277-evidence.md`
- `artifacts/issues/278-evidence.md`
- `artifacts/issues/279-evidence.md`
- `artifacts/issues/280-282-evidence.md`
- `artifacts/issues/283-284-evidence.md`

## 7. What remains blocked by genuine external dependencies

No local source/test/architecture blocker remains. The following cannot be completed locally:

1. **Remote GitHub issue closure.** `gh`/GitHub mutation access is unavailable in this environment, so #272 and its workstream issues remain open remotely.
2. **Remote CI execution.** No GitHub Actions run has executed against the local commit. A maintainer must push the branch/commit and obtain green CI before closing #272.
3. **Release/tag/distribution evidence.** Tagged releases, published artifacts, checksums, and platform release inspection remain external release operations.
4. **Physical data-plane soak.** Deterministic adapters, simulation, replay, failure injection, and unit/integration tests verify the pipeline locally; production hardware/network behavior still requires real runtime-lab/device evidence.
5. **Separate Linux runtime gate.** Linux gate #254 remains its own tracker and is not closed by this #272 implementation work.

## Closure assessment

All locally solvable #272 source/runtime/test/architecture work is complete at `3c9c998`. Maintainer action required:

1. Review this report and the listed workstream evidence.
2. Push the commit.
3. Confirm green remote CI.
4. Close #272 and its completed workstream issues only after that evidence exists.

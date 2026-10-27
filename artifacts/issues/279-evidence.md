# Evidence report — issue #279 (issue #272 Section H)

Issue #279: Outcome Verification, Recovery & Learning Loop.
Goal: make the closed loop outcome-driven rather than command-driven.

## Honest baseline

Existing coverage found by inspection, not assumed:

- `src/verification/verification.ts` — `RuntimeActionVerifier`, which delegates
  to adapters and evaluates `plan.expectedPostconditions` (string list).
- `src/recovery/recovery.ts` — `FailoverRecoveryProvider`.
- `src/safety/safety-kernel.ts` — checkpoint, rollback, recovery.

Confirmed absent before this change:

- destination/service/application outcome probing — the verifier only compared
  postcondition **strings** against an adapter verdict. An action returning
  `success` was reported as verified without proving the destination was reachable.
- health scoping — `grep` for `HealthScope|workload|transport.*region` → 0
- adaptive control intensity → 0
- failure classification by layer/failure domain → only `resilience/failure-classifier.ts`
  (IRP-vs-network, a different question)
- alternate strategy selection → 0
- rollback outcome verification → `grep verifyRollback` → 0
- strategy success/failure estimates → 0
- knowledge decay driving selection → 0
- learning loop closure → `grep learn` → 0

**The critical baseline finding:** verification was command-driven, not
outcome-driven. Nothing measured the destination after a mutation, so the loop
could never learn from a real result.

## Bounded scope (no new authority)

All new code is inside `@irp/resilience-runtime`. `OutcomeLearningLoop` produces
objective evidence, estimates and intensity; it cannot execute anything.

| File | Purpose |
|---|---|
| `src/verification/outcome-verification.ts` | t1, t2 — probes + 9 health scopes |
| `src/learning/adaptive-control.ts` | t3, t4 — intensity + layer/domain classification |
| `src/learning/strategy-outcome.ts` | t5, t8 — decayed estimates + alternate selection |
| `src/learning/outcome-learning-loop.ts` | t6, t7, t9, t10 — the closure |
| `src/canonical-runtime-composition.ts` | composition now owns the store and loop |

## Task coverage

### 1. Verify outcomes, not return codes
`verifyOutcome()` probes destination/service/application reachability. An action
reporting `success` is **never** proof: `outcomeVerified` requires every probe to
succeed. `actionSucceededButOutcomeFailed` records exactly the case #279 targets.
A throwing probe is captured as unreachable rather than crashing. With **no
probes** the destination scope is reported `unknown`, never `healthy`, so an
unverified mutation cannot reinforce a strategy.

### 2. Nine health scopes
`HEALTH_SCOPES` = resource, path, destination, service, application, workload,
transport, region, provider. Within a scope the **worst** status wins (a healthy
signal cannot average away a failure); across scopes the worst wins overall. A
scope with no signal is `unknown`, which outranks `healthy` in the aggregate —
missing evidence is not good news.

### 3. Adaptive control intensity
`AdaptiveControlIntensity` promotes only after consecutive **verified** successes
and demotes faster (default 2 failures vs 3 successes). The `ceiling` defaults to
`'degraded'`, so learning can never reach `autonomous` on its own — that requires
explicit operator policy. Tested with 200 consecutive successes.

### 4. Failure classification by layer and failure domain
`classifyFailureLayer()` reports the **outermost** failing scope as the layer,
because an outer failure bounds the inner ones as consequences. A failed transport
classifies as `transport`, not `destination`, so a destination-targeted strategy
is recognised as a blind retry. Also emits `correlated`, `healthyScopes`,
`failureDomain` and an `alternativeHint` for moving outward.

### 5. Alternate strategies, never blind retry
`selectAlternateStrategy()` excludes the failed strategy, excludes quarantined
strategies, prefers the classifier's layer hint, then highest decayed estimate.
With nothing eligible it returns `selected: undefined` and
`no-alternate-available` — the honest answer is to stop acting, not pick the
least-bad failing option.

### 6. Verify rollback outcomes
`verifyRollbackOutcome()` re-probes after rollback rather than trusting the
rollback call's return code.

### 7. Evidence recording
`OutcomeEvidence` records `decision`, `transaction`, `outcome` and `rollback`
entries with the transaction/mutation/plan ids, verified flag, summary and
detail.

### 8. Failure memory and estimates
`StrategyOutcomeEstimator` implements **decayed weighted Beta** estimation: each
outcome's weight halves per half-life, so recent verified results dominate
without discarding history. A verified rollback counts as a strategy failure
even though restoration succeeded.

### 9. Knowledge decay
`applyKnowledgeDecay()` counts records whose effective confidence has fallen below
their recorded confidence and prunes expired records explicitly.

### 10. Bounded, explainable, observable, reversible, safe
Bounded via `maxEvidence` and estimator retention. Explainable via a rationale on
every update and classification on every outcome. Observable via `snapshot()`.
Reversible via `undo()` plus a per-update `LearningUndo` capturing prior intensity
and outcome count. Safe: **only verified outcomes change selection** — unverified
outcomes are recorded as evidence and explicitly not learned from.

## Bugs found and fixed during the work

1. **Health classification inverted.** `classifyFailureLayer` took
   `failing[failing.length - 1]`, i.e. the **narrowest** failing scope, while the
   field is named `widestAffectedScope`. A transport failure was classified as
   `destination`, defeating task 4 and task 5. Fixed to `failing[0]`.
2. **Classification unavailable exactly when it mattered.** It was computed only
   after the verified check, so a *failed* outcome — the case classification
   exists for — returned no classification. Moved before the early return.
3. **Flaky `lowConfidence` (caught by repeat runs, not by a single run).**
   `lowConfidence` compared a **decayed weight** against an **outcome-count**
   threshold, so the flag flipped whenever the clock advanced between `record()`
   and `estimate()`. The test passed in isolation and failed in the suite. Fixed
   to gate on recorded outcome count; decay already affects `successRate`.
   Verified with 5 consecutive full-package runs, all 519 passing.
4. **Two new duplicate contracts.** `HealthSignal`/`HealthStatus` collided with
   existing `@irp/failover` (domain/circuit-breaker keyed) and `@irp/telemetry`
   (aggregate status) types — three meanings of one name in a single runtime.
   Renamed to `ScopedHealthSignal`/`ScopedHealthStatus` with an explanatory
   comment. Duplicates 23 → 25 → back to 23.

Test-expectation corrections: aggregate health must not read `healthy` while
scopes are unmeasured; a *verified* rollback needs a verified outcome; and
destination + application both failing is genuinely **correlated**, so the
independence test was rewritten to the case that actually is independent
(outer scope healthy).

## Acceptance criteria

- **A failed mutation produces verified rollback/recovery or a safe terminal
  state** — `verifyRollbackOutcome` re-probes; a failed outcome is marked
  `terminal: true`; escalation to recovery is covered by tests.
- **Its outcome changes future strategy selection through explicit evidence** —
  verified by tests showing a verified rollback lowers the strategy estimate
  below 0.5, a verified success raises it above 0.5, and an **unverified**
  outcome leaves the estimate untouched.

## Composition wiring (closes gaps I reported for #276 and #279)

`createCanonicalRuntime` now constructs and exposes `knowledgeStore` and
`learningLoop` as canonical per-composition instances, injectable but never
host-constructible. Each composition gets its own boundary, and the composition
stays frozen. Covered by `tests/canonical-knowledge-composition.test.ts`.

This closes the "not yet composed into `createCanonicalRuntime`" gap I reported
for #276's `KnowledgeStore`.

**Both follow-on gaps are now closed.** Canonical planning consumes per-candidate
knowledge through `evidenceFor` / `knowledgeEvidenceFunction`, and
`PrivilegedMutationBoundary` is on the live execution path — unconditionally for
every non-simulation mutation. `ResilienceRuntime` now holds `learningLoop` and
`outcomeProbes` and steps the loop in `learnFromOutcome()` after verification and
after boundary recovery, emitting `runtime.outcome.verified` and
`runtime.learning.applied`. Learning activates only from real
destination/service/application probes; with no probe the outcome is recorded as
unverified evidence and selection is unchanged.

## Tests

`tests/learning-279.test.ts` — **63 tests**: probe-based verification including
action-succeeded-but-outcome-failed, throwing probes, no-probe honesty, probe
ordering; all nine scopes, worst-in-scope, worst-across-scope, unknown
outranking healthy; layer classification, correlation, independence, outward
hints; intensity promotion/demotion/ceiling/reset; decayed estimates and
pruning; alternate selection, quarantine skipping, layer preference, determinism,
no-alternate refusal; rollback re-probing; and the full loop — evidence kinds,
verified vs unverified learning, rollback-as-failure, failure memory, knowledge
decay, ledger bounds, pruning, snapshot observability, undo and explainability.

`tests/canonical-knowledge-composition.test.ts` — 6 tests.

- `@irp/resilience-runtime`: **49 test files, 663 tests PASS** at `8f598af`
- Full workspace: **172/172 turbo tasks PASS**, 0 cached

## CI/runtime evidence (this session, uncached)

- `turbo run build typecheck lint test --force` — 172/172 PASS
- `pnpm run validate` — PASS (797 files)
- `pnpm run validate:docs` — PASS (147 files)
- `pnpm run architecture:check` — PASS
- `pnpm run architecture:guards` — PASS
- `pnpm run audit:deep` — PASS (0 findings)
- `pnpm run architecture:archaeology` — 0 orphan tests, 0 orphan modules,
  23 duplicate contracts, 29 drift findings (0 critical, 0 major)

## Remaining work for #272 — honest status

| Section | Issue | State |
|---|---|---|
| A, B | #273 | done |
| C | #274 | done |
| D | #275 | done |
| E | #276 | done; `KnowledgeStore` composed and consumed by canonical planning |
| F | #277 | done |
| G | #278 | done; boundary on the canonical live execution path |
| H | #279 | **done now** |
| I | #280 | done |
| J | #281 | done |
| K | #282 | done |
| L | #283 | done |
| M | #284 | done |

**#272 closure requires only external evidence:**

1. **Remote CI run** against the final SHA (no GitHub Actions run has executed
   locally; a maintainer must push and confirm green CI).
2. **Release/tag/distribution evidence** where applicable (tagged releases,
   published artifacts, checksums).
3. **Physical data-plane soak** beyond deterministic adapters/simulation
   (device/network runs).

No local source/test/architecture blocker remains. No issue can be honestly
closed
until a maintainer pushes and CI is green.
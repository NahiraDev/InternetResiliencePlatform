# Evidence report — issue #277 (issue #272 Section F)

Issue #277: Strategy / Optimization / Planning / Scheduling.
#272 Section F requirements: intent-aware decisions, multi-candidate strategies,
objective-driven optimization, structured plans, safety boundaries, resource
reservation and concurrency control, stale-decision protection.

## Honest baseline

`packages/resilience-runtime/src/planning/planner.ts` ranked candidates with a
fixed `confidence -> expectedBenefit -> risk -> intent -> id` sort. That is
precisely the "one hard-coded score" Section F prohibits. Verified absent before
this change:

- no multi-candidate strategy generation (`grep` for `optimiz`, `candidateStrategies` → 0)
- no resource reservation / epoch / resource-version staleness (`grep` → 0)
- no structured plan envelope (preconditions, ordering, safety boundaries, timeout)
- no learning or knowledge-update path (`grep` → 0)
- no event versioning (`grep` for `eventVersion` → 0)

Sections E (#276), H (#279) and J (#281) remain **unimplemented**; this report
covers only Section F.

## Bounded scope (no new authority)

All new code is inside `@irp/resilience-runtime`, the canonical production
orchestration authority. The planner remains the single planning gate and still
performs the only policy evaluation. No new planner, scheduler, bus or policy
engine was introduced.

| File                                 | Purpose                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `src/planning/objectives.ts`         | 13 Section F objectives, intent projection, weighted explainable scoring     |
| `src/planning/strategy-generator.ts` | deterministic primary/fallback/conservative/alternate ladder                 |
| `src/planning/reservation.ts`        | epoch, resource reservation, TTL/resource-version staleness, structured plan |
| `src/planning/planner.ts`            | `planAgainstObjectives()`; `plan()` delegates to shared `planFromRanked()`   |

## Task coverage

### 1. Intent-aware decisions

`objectivesFromIntent()` projects `CompiledIntent.objectives` onto the canonical
objective set, with `reliability` aliased to `stability` and unmapped keys
ignored. `DeterministicPlanner.planAgainstObjectives()` records the resulting
weights and score in `plan.metadata.optimization`, so a decision is justified
against the intent rather than a black-box number.

### 2. Multiple candidate strategies

`generateStrategies()` expands a deterministic ladder: `primary`
(`connectivity_failover`), `fallback` (`provider_switch`), `conservative`
(`degraded_mode`), `alternate` (`health_reprobe`). Each carries a rationale and
scales benefit/risk/confidence off the primary seed. Generation never filters by
policy — policy evaluation stays at the canonical planning gate, so denied
alternatives remain explainable in the plan.

### 3. Optimize against intent-derived objectives

`scoreCandidate()` produces a normalized weighted score **plus a per-objective
contribution map**, so every ranking decision is auditable. Unmeasured objectives
(privacy, security, diversity) score a neutral `0.5` rather than being invented as
favourable. Ties fall back to the legacy deterministic ordering, so results stay
reproducible.

### 4. Structured plans

`buildStructuredPlan()` produces `preconditions`, ordered `steps` (primary first,
then the ranked fallback ladder), `safetyBoundaries`
(`no-mutation-without-policy`, `no-mutation-without-capability`,
`transactional-apply-with-rollback`), `timeoutMs`, `verificationRequirements` and
`rollbackStrategy`, all stamped with the `epoch` the plan was computed against.

### 5. Resource reservation and concurrency control

`ResourceReservationTable` grants exclusive per-resource reservations, supports
configured capacity, rejects double-holds (`already-reserved`), frees on release
and on TTL expiry, and exposes `reservedResourceIds()` plus `snapshot()`.

### 6. Stale-decision protection

Four independent guards, each with a typed reason:

| Guard                                       | Reason                                                   |
| ------------------------------------------- | -------------------------------------------------------- |
| decision epoch superseded                   | `epoch-too-old` / `epoch-superseded`                     |
| resource version moved                      | `resource-version-mismatch` / `resource-version-changed` |
| reservation TTL elapsed                     | `ttl-expired`                                            |
| reservation issued for a different resource | `resource-version-changed`                               |

`validateForExecution()` is the gate immediately before execution; a stale
decision returns `{ stale: true }` and must not mutate.

## Bugs found and fixed during the work

Two real defects in my own first implementation were caught by tests before
shipping:

1. **Objective renormalization collapsed to zero.** When an intent's expressed
   weights summed to 1 (e.g. `{ latency: 1 }`), the residual share for the other
   12 objectives computed to `0`, silently ignoring 12 dimensions. Replaced with an
   explicit `RESIDUAL_SHARE = 0.25` budget. A regression test now asserts weights
   sum to 1 across single, multi and fully-expressed intents.
2. **Fully-expressed intents under-weighted everything by 25%.** With all 13
   objectives expressed there was nothing to reserve residual budget for, so the
   total came to 0.75 instead of 1. Now `expressedBudget` becomes `1` when no
   objective is unexpressed.

A third issue was caught by `tsc`: I invented intent names (`reroute`,
`failover`, `defer`, `throttle`) that are not in the canonical `ActionIntent`
union. Replaced with the real `connectivity_failover`, `provider_switch`,
`degraded_mode`, `health_reprobe`.

## Tests

`tests/planning-277.test.ts` — **44 tests**, covering: objective set completeness,
intent projection and normalization, sum-to-1 invariant, unmapped/non-finite
handling, different ranking under different objectives, determinism, plan
optimization metadata, legacy `plan()` parity, the four-strategy ladder,
monotonic risk/benefit, value clamping, no upstream policy filtering, reservation
grant/hold/release/expiry/capacity/ttl validation, all four staleness guards, and
structured-plan completeness.

- `@irp/resilience-runtime`: **37 test files, 338 tests PASS**
- Full workspace: **172/172 turbo tasks PASS**, 0 cached

## CI/runtime evidence (this session, uncached)

- `turbo run build typecheck lint test --force` — 172/172 PASS
- `pnpm run validate` — PASS (777 files)
- `pnpm run validate:docs` — PASS (147 files)
- `pnpm run architecture:check` — PASS
- `pnpm run architecture:guards` — PASS
- `pnpm run audit:deep` — PASS (0 findings)

## Not covered / known limitations

- `generateStrategies()` is a deterministic template expansion. It does **not**
  invent new strategies from measured topology; wiring it to
  `ProgrammableConnectivityFabric` alternatives is the next step.
- `ResourceReservationTable` is not yet invoked on the execution path — it is a
  canonical building block awaiting wiring into the decision provider so
  reservations are taken before mutation.
- Sections E (#276), H (#279) and J (#281) remain unimplemented, so the #272
  end-to-end pipeline is still incomplete end to end.
- No CI run has executed against this SHA; #272 cannot honestly be closed until
  sections E, F, H and J all land and a maintainer confirms green CI.

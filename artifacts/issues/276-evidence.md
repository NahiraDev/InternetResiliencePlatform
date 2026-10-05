# Evidence report — issue #276 (issue #272 Section E)

Issue #276: Knowledge Plane, Intelligence, Evidence & Federation.
Section E requires one evidence-backed knowledge boundary for current and
historical network intelligence.

## Honest baseline

Existing partial coverage found by inspection, not assumed:

- `src/federation/probe-federation.ts` — signed probe ingestion, already
  destination-scoped. Extended-by-design, not duplicated.
- `src/federation/federated-advisory.ts` — converts signed probes into advisory
  ranking input. Kept; the knowledge plane now supplies the arbitration.
- `src/historical-advisory.ts` — historical advisory provider. Kept.
- `src/canonical-decision-provider.ts:251` `annotateHistory()` — attached
  `historicalEvidence` to candidate **metadata only**.

**The critical baseline finding:** history was annotated but never consumed by
ranking. `#276`'s acceptance criterion — "knowledge inputs materially affect
canonical decisions when valid" — was therefore **not met** before this change.
Confirmed by `grep` for `optimiz|candidateStrategies` returning zero hits before
the Section F work, and by reading the ranking path directly.

## Bounded scope (no new authority)

All new code is inside `@irp/resilience-runtime`. Knowledge is a read/advisory
plane only: it produces objective evidence and bounded score multipliers. It
cannot grant a capability, allow an action, deny one, or bypass policy. Policy
remains the only denial authority.

| File                                   | Purpose                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/knowledge/knowledge-record.ts`    | unified record: 7 kinds, 8 sources, provenance/freshness/confidence/scope/corroboration/expiry |
| `src/knowledge/arbitration.ts`         | deterministic weighted evidence/confidence arbitration                                         |
| `src/knowledge/knowledge-store.ts`     | single boundary combining every evidence family                                                |
| `src/knowledge/failure-memory.ts`      | exponentially decaying failure memory + strategy quarantine                                    |
| `src/knowledge/prediction.ts`          | predictive signals with confidence + time horizon                                              |
| `src/knowledge/knowledge-influence.ts` | knowledge → canonical ranking integration                                                      |

## Task coverage

### 1. Combine every evidence family

`KNOWLEDGE_SOURCES` covers `observation`, `measurement`, `topology`, `history`,
`failure-memory`, `destination`, `provider`, `federated`.
`SOURCE_TRUST_ORDER` orders them for arbitration only — never for authority.
`KnowledgeStore` ingests, indexes, queries, arbitrates and prunes across all
eight families in one boundary.

### 2. Provenance, timestamp, freshness, confidence, scope, corroboration, expiry

Every record carries `provenance` (producer, source, signature, trustLevel),
`observedAt` (when the fact occurred, not when the record was built),
`expiresAt`, optional `halfLifeMs`, `confidence`, `scope`
(destination/providerId/pathId/region), and `corroborations`. `decayedConfidence()`
decays exponentially to expiry. `KnowledgeValidationError` rejects malformed
records rather than admitting them into arbitration.

### 3. Seven epistemic kinds

`KNOWLEDGE_KINDS` = observation, measurement, inference, hypothesis, prediction,
decision, outcome. The kind is mandatory and preserved on the record, so a
prediction can never be read as an observation. Predictions are additionally
required to declare an expiry so they cannot silently become permanent knowledge.

### 4. Deterministic evidence/confidence arbitration

`arbitrateKnowledge()` weights each record by
`decayedConfidence x sourceTrust x corroborationFactor`, aggregates a weighted
mean, and retains every contribution plus every rejection reason. Ordering is
deterministic (freshest, then id) so results never depend on input order.
`explainArbitration()` produces a readable trace.

Corroboration raises **weight only, never value**, so independent corroboration
cannot inflate a measurement into an invented fact.

### 5. Advisory, signed, destination-scoped, fail-safe

`isAdvisoryOnly()` marks `federated` and `history`. `scopeMatches()` requires every
declared scope field to agree, so one destination's probes cannot steer another.
Unsigned federated knowledge is rejected (`unsigned-federation`), as is
`trustLevel: 'untrusted'` (`untrusted-federation`) unless explicitly allowed.

### 6. Integrate knowledge into canonical strategy ranking — **the real gap**

`mergeKnowledgeEvidence()` overrides only the objectives knowledge actually
measured; unmeasured objectives keep the planner's own defaults, so knowledge
cannot dominate the whole score. `knowledgeEvidenceFunction()` produces the
planner's `evidenceFor`, so knowledge participates in the **existing** canonical
planner — no second planner or decision path was created. It accepts
`arbitratedFor` so path-scoped evidence applies per candidate.
`knowledgeInfluenceFor()` additionally applies a bounded failure-memory
quarantine multiplier (0..1).

### 7. Predictive signals with confidence and horizon

`predictiveSignalRecord()` builds predictions that must declare `horizonMs` and
derive `expiresAt` from it. `fusePredictions()` fuses only `kind === 'prediction'`
records, weighted by decayed confidence × horizon, and returns `undefined` rather
than inventing a weak prediction when nothing clears `minConfidence`. Fused
objectives need a minimum weight share so one weak signal cannot pollute a
dimension.

### 8. Decaying failure memory and strategy quarantine

`DecayingFailureMemory` records failures per strategy+destination+provider, decays
by `0.5^(age/halfLife)`, and discards anything past retention. Below threshold the
penalty is graduated; at/above it the strategy is quarantined at
`quarantinePenalty`. There is **no deny path** — this module can only multiply a
score, by design.

### 9. Local decisions continue when federation is unavailable

`KnowledgeStore.arbitrate()` never throws; it returns an empty result when the
store is empty. `arbitrateKnowledge([])` returns a frozen empty result. Ranking
proceeds on local measurement alone, and `knowledgeInfluenceFor()` leaves the
multiplier at 1 with no failure memory. Tested explicitly.

## Bugs found and fixed during the work

Three real defects, all caught before shipping:

1. **Failure memory double-counted every failure.** `quarantineFor` unioned the
   wildcard bucket with the scope-specific bucket, but with an empty scope both
   resolve to the _same_ array key — so every failure counted twice and quarantine
   triggered at half its intended threshold. Fixed with explicit identity
   comparison between the two buckets.
2. **Knowledge could not be per-candidate.** `knowledgeEvidenceFunction` applied
   one arbitration result to every candidate, so path-scoped evidence for the
   incumbent leaked onto alternatives. Added `arbitratedFor` so evidence is
   resolved per candidate.
3. **Duplicate `source` key** in the record literal tripped `tsc` (TS1117), because
   `AuditFields.source` and `KnowledgeRecord.source` declare the same field.
   Resolved to a single assignment with a clarifying comment.

Test-expectation corrections: non-finite evidence is rejected at _construction_
(not arbitration), expired records are filtered by `query()` before arbitration,
and the quarantine threshold must sit between one and two failures. A debug run
also showed the ranking flip test had its semantics inverted — knowledge marking
the incumbent's latency as bad is what should flip the outcome.

## Acceptance criteria

- **Materially affect canonical decisions when valid** — proven by a test that
  plans the same two candidates with and without knowledge and asserts the
  **selected strategy flips** from `a` to `b`.
- **Remain explainable** — every arbitration contribution and rejection is
  retained; `explainArbitration()` and `knowledgeInfluenceFor().explanation`
  produce readable traces; `DecayingFailureMemory.snapshot()` exposes
  quarantine reasons, weights and last-failure times.
- **Cannot become unrestricted mutation authority** — asserted structurally: the
  influence surface is exactly
  `['advisoryShare','explanation','objectiveEvidence','scoreMultiplier']`. No
  capability grant, no denial, no policy bypass. `architecture:guards` passes.

## Tests

`tests/knowledge-276.test.ts` — **49 tests** covering all 7 kinds, all 8 sources,
every required attribute, validation rejections, decay/expiry, scope matching,
weighted-mean arbitration, order-independence, source trust ordering, all five
rejection reasons, corroboration-without-inflation, advisory share, store
indexing/filtering/eviction/expunge, outcomes closing the loop, failure decay,
destination scoping, quarantine listing/pruning, no-deny-path, prediction fusion
and refusal, knowledge flipping the selection, and federation-outage survival.

- `@irp/resilience-runtime`: **49 test files, 663 tests PASS** at `8f598af`
- Full workspace: **172/172 turbo tasks PASS**, 0 cached

## CI/runtime evidence (this session, uncached)

- `turbo run build typecheck lint test --force` — 172/172 PASS
- `pnpm run validate` — PASS (785 files)
- `pnpm run validate:docs` — PASS (147 files)
- `pnpm run architecture:check` — PASS
- `pnpm run architecture:guards` — PASS
- `pnpm run audit:deep` — PASS (0 findings)
- `pnpm run architecture:archaeology` — 0 orphan tests, 0 orphan modules, 23
  duplicate contracts, 29 drift findings (0 critical, 0 major)

## Known limitations

- The knowledge store is in-memory, but Section J (#281) persistence is now implemented:
  `DegradableStore` serves reads from an authoritative local mirror, queues retries behind a
  **bounded** queue, and reports `droppedWrites` so loss during a long outage is observable rather
  than silent. Durable knowledge across process restarts is still not attempted.
- `KnowledgeStore` is composed into `createCanonicalRuntime` (both sync and
  Postgres factories) and consumed by `ResilienceRuntime` planning through
  `knowledgeEvidenceFunction`, including per-candidate destination/provider/path
  arbitration via `arbitratedFor`. Proven by
  `tests/canonical-knowledge-composition.test.ts` (“routes compositional
  knowledge into canonical planning decisions”), which flips the selected
  strategy after valid path-scoped knowledge is admitted.
- `probe-federation.ts` signature verification predates this work; the knowledge
  plane enforces _presence_ of a signature and trust level, not cryptographic
  re-verification of the underlying probe transport.
- Sections H (#279) and J (#281) are implemented; see their evidence reports
  for remaining external-only blockers (remote CI, release artifacts,
  device soak).
- No CI run has executed against this SHA.

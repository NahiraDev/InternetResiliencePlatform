# Phase 83 — Policy Conflict Resolution

## Status

**Contract formalized (issue #13).** Implementation already present on `main` at baseline SHA `decd9211406e330a1efd0e086beb29820ec210b7` in intent arbitration and API conflict surfaces. Disposition remains **PARTIAL** until CI evidence is recorded against this contract and the phase matrix is updated from evidence only.

## Objective

Detect and deterministically resolve conflicts between multiple effective intents (and, where present, policy snapshots) that share overlapping scope but disagree on desired outcome. Resolution is pure and ordered; it does not execute network mutations.

## Dependencies

- Phase 79 — Intent Model & Lifecycle
- Phase 81 — Intent Translation / Compilation
- Phase 82 — Policy Decision & Enforcement Engine (admission consumes ordered results)

## Canonical owner

- `@irp/resilience-runtime` — `src/intent/arbitration.ts` (`arbitrateIntents`, conflict types, `InMemoryIntentStore`)
- Durable store: `src/intent/postgres-store.ts` (`PostgresIntentStore`)
- API conflict listing: `apps/api/src/intent-api.ts` (conflict query surface)
- Related migration: `packages/database/prisma/migrations/20260930103000_phase_274_intent_ownership`
- Tests: `packages/resilience-runtime/tests/intent-governance.test.ts` (arbitration paths), `apps/api/src/intent-api.test.ts` (API)

## Scope

- Filter to effective intents using the shared effective-window semantics.
- Order by priority → version → recency.
- Detect overlapping scopes with different desired outcomes.
- Emit structured `IntentConflict` / `PolicyConflict` records with an explicit resolution rule (`supersede-a` / `supersede-b` / union / intersection / hierarchical as applicable).
- Provide in-memory and Postgres-backed store interfaces for intent persistence used by arbitration consumers.
- Expose bounded conflict listing through the authenticated intent API when enabled.

## Non-goals

- Automatic network mutation or plan application as a side effect of conflict detection.
- Human workflow / ticket system for conflict approval (later governance phases).
- A second event bus or global conflict authority outside `@irp/resilience-runtime`.

## Acceptance criteria

1. `arbitrateIntents` returns ordered effective intents plus a conflict list with reasons and resolution tags.
2. Overlapping different outcomes produce a conflict; non-overlapping or identical outcomes do not false-positive.
3. Higher priority (then newer version) determines supersession direction.
4. Stale intents are excluded before conflict analysis (shared effective-window helper).
5. Unit/API tests cover: no-conflict path, priority supersession, same-priority version supersession, and API conflict listing when present.
6. Store interfaces remain optional/degradable; local autonomy survives remote DB unavailability where the architecture requires it.
7. Applicable package and API tests pass on the contract SHA.

## Verification boundary

Source presence is not completion. Phase 83 completion requires mapped paths, green tests/CI on a recorded SHA, and matrix update only from evidence regeneration.

## Evidence map (baseline SHA `decd921`)

| Criterion | Location |
|-----------|----------|
| Arbitration | `packages/resilience-runtime/src/intent/arbitration.ts` |
| Postgres store | `packages/resilience-runtime/src/intent/postgres-store.ts` |
| API + ownership | `apps/api/src/intent-api.ts` (`IntentOwnership`, conflict query) |
| API tests | `apps/api/src/intent-api.test.ts` |
| Governance integration | `packages/resilience-runtime/src/intent/governance.ts` + tests |
| Ownership migration | `packages/database/prisma/migrations/20260930103000_phase_274_intent_ownership` |

## Known gaps (do not hide)

- Full durable conflict-journal end-to-end certification under production load is part of release/integration evidence, not satisfied by unit tests alone.
- PolicySnapshot pairwise resolution paths beyond intent-vs-intent may still be thin; expand only by extending the existing arbitration module.

## Rollback

Disable conflict emission and return ordered effective intents only; keep stores and Phase 79–82 surfaces. Prefer fail-closed admission over silent multi-intent application.

## Authorization note

Issue #13 authorizes contract definition and mapping of existing capability for Phases 79–83. Gap-fill must extend the existing arbitration module, not create a parallel conflict engine.

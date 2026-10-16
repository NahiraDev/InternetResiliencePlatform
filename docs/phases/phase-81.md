# Phase 81 — Intent Translation / Compilation

## Status

**Contract formalized (issue #13).** Implementation already present on `main` at baseline SHA `decd9211406e330a1efd0e086beb29820ec210b7`. This phase document defines the acceptance contract and maps existing code/tests. Disposition remains **PARTIAL** until CI evidence is recorded against this contract and the phase matrix is regenerated from evidence (not documentation alone).

## Objective

Translate a declarative `NetworkIntent` into a normalized `CompiledIntent` that downstream decision, governance and arbitration consumers can evaluate without re-interpreting free-text outcomes. Compilation is pure, deterministic and side-effect free.

## Dependencies

- Phase 79 — Intent Model & Lifecycle (`NetworkIntent` in `@irp/core`)
- Phase 78 — Closed-Loop Control Foundation (canonical runtime path)

## Canonical owner

- `@irp/resilience-runtime` — `src/intent/compiler.ts`
- Tests: `packages/resilience-runtime/tests/intent-compiler.test.ts`
- Public exports: `compileNetworkIntent`, `isCompiledIntentEffective` via `src/intent/index.ts`

## Scope

- Map `NetworkIntent.spec.outcome` and optional objectives/constraints/target into a frozen `CompiledIntent`.
- Derive bounded objective weights (0–1) from outcome text heuristics plus explicit `spec.objectives`.
- Preserve identity, priority, autonomy, confidence, provenance, effective window and version.
- Provide `isCompiledIntentEffective` using the same `[effectiveFrom, expiresAt)` window as Phase 79.
- Reject or fail closed on invalid source intents at the model boundary (Phase 79); compiler assumes a valid `NetworkIntent`.

## Non-goals

- No HTTP ingestion (Phase 80).
- No multi-intent arbitration or policy conflict resolution (Phase 83).
- No policy decision/enforcement engine (Phase 82).
- No network mutation, planning or execution.
- No second intent model or parallel compiler authority.

## Acceptance criteria

1. `compileNetworkIntent(NetworkIntent) → CompiledIntent` is exported from `@irp/resilience-runtime`.
2. Compiled objectives are finite numbers in `[0, 1]` and frozen.
3. `isCompiledIntentEffective` matches Phase 79 effective-window semantics and rejects stale intents outside the window.
4. Unit tests cover: active intent compilation, objective derivation from outcome text, explicit objective override, effective/expired window, and immutability of the compiled result.
5. Compiler remains a pure function (no I/O, no store writes).
6. Repository gates applicable to the package (`typecheck`, package tests) pass on the contract SHA.

## Verification boundary

Source presence is not completion. Phase 81 completion requires:

- Linked package paths and test file above.
- Green package/unit test run (or CI workflow URL) on a recorded SHA.
- Phase matrix update only after evidence regeneration (see issue #12/#13 process).

## Evidence map (baseline SHA `decd921`)

| Criterion | Location |
|-----------|----------|
| Compiler | `packages/resilience-runtime/src/intent/compiler.ts` |
| Effective check | `isCompiledIntentEffective` in same file |
| Tests | `packages/resilience-runtime/tests/intent-compiler.test.ts` |
| Export | `packages/resilience-runtime/src/intent/index.ts` |

## Rollback

Remove or isolate `compiler.ts` and its tests; leave Phase 79 model and Phase 80 API intact. Downstream governance must then stop importing `compileNetworkIntent`.

## Authorization note

Issue #13 authorizes **contract definition and mapping of existing capability** for Phases 79–83. It does not authorize independent green-field Phase 81 implementation beyond gap-fill required by the acceptance criteria above.

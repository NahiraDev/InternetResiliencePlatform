# Phase 82 — Policy Decision & Enforcement Engine

## Status

**Contract formalized (issue #13).** Implementation fragments already present on `main` at baseline SHA `decd9211406e330a1efd0e086beb29820ec210b7` under intent governance and autonomy enforcement. This phase document defines the acceptance contract and maps existing code/tests. Disposition remains **PARTIAL** until CI evidence is recorded against this contract and remaining policy-engine gaps (if any) are closed without creating a second authority.

## Objective

Decide whether a compiled intent (or set of candidates) may be admitted for planning/mutation under the current runtime mode, autonomy level and safety boundaries. Enforcement is advisory-to-gating only: it never bypasses the Phase 77 safety/rollback kernel or invents a parallel decision engine.

## Dependencies

- Phase 79 — Intent Model & Lifecycle
- Phase 81 — Intent Translation / Compilation
- Phase 77 — Safety, Rollback & Recovery Kernel
- Phase 78 — Closed-Loop Control Foundation

## Canonical owner

- `@irp/resilience-runtime` — `src/intent/governance.ts` (admission, selection, mutationAllowed)
- Autonomy gate: `enforceAutonomy` in `src/intent/arbitration.ts` (re-exported)
- Core autonomy predicate: `isAutonomyPermitted` from `@irp/core`
- Tests: `packages/resilience-runtime/tests/intent-governance.test.ts`

## Scope

- Admit / plan-only / require-approval / deny decisions (`IntentAdmission`).
- Select a governed intent from candidates using priority, confidence, autonomy and scope specificity.
- Reject stale (non-effective) intents before admission.
- Surface `mutationAllowed` consistent with runtime mode (`live` vs non-mutating modes).
- Fail closed when no admissible candidate exists.

## Non-goals

- Full organization-wide policy language or external PDP/PEP product (later phases / Group F).
- Conflict journal persistence beyond what Phase 83 already provides.
- Network mutation execution (Phase 76 transaction engine remains the only mutator).
- Second global policy registry or control-plane authority.

## Acceptance criteria

1. `resolveIntentGovernance` / `selectGovernedIntents` (or equivalent exported surface) produce an `IntentGovernanceDecision` with admission, selected intent, rejected set and reasons.
2. Stale intents outside their effective window are rejected with an explicit reason.
3. Autonomy levels `OBSERVE_ONLY` / `ADVISORY` / `HIGH_RISK_REQUIRES_APPROVAL` cannot silently grant mutation in non-live or restricted modes.
4. Unit tests cover: allow path, plan-only, deny, stale rejection, overlapping candidate selection, and mode-gated mutationAllowed.
5. No new top-level control-plane package is introduced; ownership stays under `@irp/resilience-runtime`.
6. Applicable package tests and typecheck pass on the contract SHA.

## Verification boundary

Source presence is not completion. Phase 82 completion requires mapped paths, green tests/CI evidence on a recorded SHA, and phase-matrix update only from regenerated evidence.

## Evidence map (baseline SHA `decd921`)

| Criterion | Location |
|-----------|----------|
| Governance decision | `packages/resilience-runtime/src/intent/governance.ts` |
| Autonomy enforcement | `packages/resilience-runtime/src/intent/arbitration.ts` (`enforceAutonomy`) |
| Tests | `packages/resilience-runtime/tests/intent-governance.test.ts` |
| Core autonomy helper | `@irp/core` (`isAutonomyPermitted` and related) |

## Known gaps (do not hide)

- A broader declarative policy language and cross-domain enforcement engine beyond intent admission is still roadmap work (see MASTER_ROADMAP_V2 Groups B/F). This phase contract covers the **intent-scoped** decision/enforcement path only.
- End-to-end “API → runtime → Postgres ownership” certification remains part of issue #13 gap-fill and release gates, not automatic COMPLETE.

## Rollback

Revert governance admission changes; keep compiler and Phase 79 model. Runtime must continue to fail closed when governance is unavailable.

## Authorization note

Issue #13 authorizes contract definition and mapping of existing intent/policy capability for Phases 79–83. Implementation work is limited to closing verified acceptance gaps without inventing a competing policy engine.

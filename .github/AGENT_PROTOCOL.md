# Agent Protocol

## Startup procedure

Before changing anything:

1. Read `PROJECT_STATE.md`.
2. Read `.github/ACTIVE_WORK.md`.
3. Read `docs/roadmap/MASTER_ROADMAP_V2.md` for current post-70 planning.
4. Read `ROADMAP.md` only as the historical/v1 0–70 roadmap unless the task explicitly concerns historical reconstruction.
5. Read the active phase record.
6. Locate the canonical package/domain that already owns the behavior.
7. Read relevant architecture and API contracts.
8. Check current git/PR/CI state before assuming a failure is current.
9. Declare a narrow scope and avoid unrelated cleanup.

## Implementation procedure

- Prefer existing contracts and adapters over new parallel abstractions.
- Preserve deterministic behavior and explicit error semantics.
- Add tests for normal, boundary, invalid, concurrency and failure paths as applicable.
- For runtime changes, test startup, readiness, steady state, failure, cancellation and cleanup.
- For CI changes, validate workflow syntax and inspect the complete dependency graph.
- For Phase 72–150 work, one phase owner and one package/file owner are required; cross-phase contract changes require integration review.

## Verification procedure

Run the smallest useful checks during development, then the complete required gates before handoff:

- formatting/prettier where applicable;
- lint;
- typecheck;
- relevant unit/integration tests;
- build;
- runtime/container verification when applicable;
- repository-level CI when required.

Never replace a failing verification with a weaker test merely to obtain a green result.

## Handoff format

Every completed task must leave a concise handoff containing:

```text
Objective:
Scope:
Implementation:
Tests:
CI/runtime evidence:
Known limitations:
Potential follow-up:
```

## Conflict protocol

If a required contract changed after work began:

1. stop implementation;
2. inspect the new canonical contract;
3. reconcile the change explicitly;
4. rerun affected verification;
5. record the integration dependency.

Do not resolve conflicts by choosing whichever version makes tests pass without understanding the architectural change.

## Phase integrity

`PROJECT_STATE.md` defines the current implementation gate. `docs/roadmap/MASTER_ROADMAP_V2.md` defines current post-70 product planning. Historical 0–70 roadmap documents do not override those sources.

Source files alone never advance a phase. Completion requires the evidence and acceptance criteria defined by the project state and phase record.

No Phase 72–150 implementation may introduce a second control-plane runtime, decision engine, global state registry, policy engine, event bus or provider registry when an existing canonical owner can be extended safely.

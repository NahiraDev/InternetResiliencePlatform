# Agent Protocol

## Startup procedure

Before changing anything:

1. Read `PROJECT_STATE.md`.
2. Read `ROADMAP.md` and the active phase record.
3. Locate the canonical package/domain that already owns the behavior.
4. Read relevant architecture contracts.
5. Check current git/PR/CI state before assuming a failure is current.
6. Declare a narrow scope and avoid unrelated cleanup.

## Implementation procedure

- Prefer existing contracts and adapters over new parallel abstractions.
- Preserve deterministic behavior and explicit error semantics.
- Add tests for normal, boundary, invalid, concurrency and failure paths as applicable.
- For runtime changes, test startup, readiness, steady state, failure, cancellation and cleanup.
- For CI changes, validate workflow syntax and inspect the complete dependency graph.

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

The phase number in `PROJECT_STATE.md` is authoritative. Source files alone never advance a phase. Completion requires the evidence and acceptance criteria defined by the project state and phase record.

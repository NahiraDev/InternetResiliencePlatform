# Active Work

Canonical coordination record for parallel agents. This file is intentionally short; detailed evidence belongs in issues/PRs and phase records.

## Current baseline

- Current implementation baseline: **Phase 78 — Closed-Loop Control Foundation is implemented on main**. Its bounded closed-loop controller is part of the canonical @irp/resilience-runtime path.
- Current execution tracker: open issues **#4**, **#12**, **#13**, **#14**. Phase 84/85 contracts are formalized; Phase 85 has a minimal observe-only drift detector on branch `phase/85-observe-only-drift`.
- Main branch: `main`
- Current main commit reviewed: `7d063bff0dce0a3f7a6b3605f99b3e520b14bb26`.
- Latest implementation merge observed on this baseline: **PR #28** (Phase 84/85 contracts).
- Phase 71 status: implementation/release contract work exists; external release certification remains open (issue #4). Published GitHub Release v0.2.1 is developer-preview evidence only.
- Release certification must not be inferred from source presence, local tests, or architecture checks alone.
- Current work must close source → contract → consumer → entrypoint → execution → outcome gaps without creating a second control plane or declaring completion from source presence alone.

## Active agent slots

| Slot | Role                         | Scope                                               | Status    |
| ---- | ---------------------------- | --------------------------------------------------- | --------- |
| A    | phase-implementer            | One roadmap workstream                              | available |
| B    | ci-runtime-engineer          | .github/workflows, runtime lab infrastructure       | available |
| C    | architecture-reviewer        | architecture/contracts/dependency direction         | available |
| D    | test-verification-engineer   | tests, deterministic verification, failure analysis | available |
| E    | integration-release-engineer | integration, final gates, release readiness         | available |

## Coordination rules

- One agent owns a file/package at a time. Architecture work must preserve `ResilienceRuntime` as the sole production orchestration authority.
- Shared contract changes require integration review before dependent implementation proceeds.
- Do not mark a workstream complete while any required verification gate is unresolved.
- Use open issues #4/#12/#13/#14 as the current execution tracker. `docs/roadmap/MASTER_ROADMAP_V2.md` remains architectural reference material; new phases require formalized contracts and authorization.
- Do not use this file to claim a CI result; link to actual CI evidence in the phase record or PR.
- Do not start dependent runtime implementation merely because a historical phase document exists; honor the evidence-backed workstream dependency graph and current repository truth.
- Baseline changes to this file must record the actual reviewed `main` commit; never copy an older handoff SHA forward.

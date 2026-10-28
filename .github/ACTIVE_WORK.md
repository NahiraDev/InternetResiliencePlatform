# Active Work

Canonical coordination record for parallel agents. This file is intentionally short; detailed evidence belongs in issues/PRs and phase records.

## Current baseline

- Current implementation baseline: **Phases 94–150 implemented locally** (branch `phase/94-150-implementation`, PARTIAL pending exact-SHA CI). Phase 93 and earlier unchanged. ResilienceRuntime remains the sole production mutation authority.
- Current execution tracker: open issues **#254**, **#272**, **#284**, **#323**, **#410**, **#412**, **#413**, **#420**.
- Main branch: `main`
- Current main commit reviewed: `9d6c1d562e5c3b0e868cc03b3acd3993b0346a13`.
- Phase 71 status: implementation/release contract work exists; external release certification remains open. Published GitHub Release v0.2.1 is developer-preview evidence only.
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
- Use open issues #254/#272/#284/#323 as the current execution tracker. `docs/roadmap/MASTER_ROADMAP_V2.md` remains architectural reference material; new phases require formalized contracts and authorization.
- Do not use this file to claim a CI result; link to actual CI evidence in the phase record or PR.
- Do not start dependent runtime implementation merely because a historical phase document exists; honor the evidence-backed workstream dependency graph and current repository truth.
- Baseline changes to this file must record the actual reviewed `main` commit; never copy an older handoff SHA forward.

# Active Work

Canonical coordination record for parallel agents. This file is intentionally short; detailed evidence belongs in issues/PRs and phase records.

## Current baseline

- Current implementation baseline: **Phase 78 — Closed-Loop Control Foundation is implemented on main**. Its bounded closed-loop controller is part of the canonical @irp/resilience-runtime path.
- Current execution tracker: GitHub issue **#272** and workstreams **#273–#284**, plus Linux runtime gate **#254**. These workstreams are the active post-Phase-78 integration/evidence backlog; do not create or treat Phase 79+ as the execution roadmap unless the canonical tracker is explicitly revised.
- Main branch: `main`
- Current main commit reviewed: `6dd19a7936932c23c4b4115bb298991dabfa7cc2`.
- Latest implementation merge observed on this baseline: **PR #303**.
- Phase 71 status: implementation/release contract work exists, but external release certification remains open. There is no published GitHub Release to use as certification evidence.
- Release certification must not be inferred from source presence, local tests, or architecture checks alone.
- Current work must close source → contract → consumer → entrypoint → execution → outcome gaps without creating a second control plane or declaring completion from source presence alone.

## Active agent slots

| Slot | Role | Scope | Status |
| ---- | ---- | ----- | ------ |
| A | phase-implementer | One roadmap workstream | available |
| B | ci-runtime-engineer | .github/workflows, runtime lab infrastructure | available |
| C | architecture-reviewer | architecture/contracts/dependency direction | available |
| D | test-verification-engineer | tests, deterministic verification, failure analysis | available |
| E | integration-release-engineer | integration, final gates, release readiness | available |

## Coordination rules

- One agent owns a file/package at a time. Architecture work must preserve `ResilienceRuntime` as the sole production orchestration authority.
- Shared contract changes require integration review before dependent implementation proceeds.
- Do not mark a workstream complete while any required verification gate is unresolved.
- Use GitHub issue #272 and workstreams #273–#284 as the current execution tracker. `docs/roadmap/MASTER_ROADMAP_V2.md` remains architectural reference material, not permission to start Phase 79+.
- Do not use this file to claim a CI result; link to actual CI evidence in the phase record or PR.
- Do not start dependent runtime implementation merely because a historical phase document exists; honor the evidence-backed workstream dependency graph and current repository truth.
- Baseline changes to this file must record the actual reviewed `main` commit; never copy an older handoff SHA forward.
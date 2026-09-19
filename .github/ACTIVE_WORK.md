# Active Work

Canonical coordination record for parallel agents. This file is intentionally short; detailed evidence belongs in issues/PRs and phase records.

## Current baseline

- Current implementation baseline: **Phase 78 — Closed-Loop Control Foundation**. The repository is now advanced through the product-realization master tracker (`#272`) and its workstreams (`#273`–`#284`); do not create or treat Phase 79+ as the execution roadmap.
- Phase 71 status: implementation complete; external release evidence is still required before certification.
- Main branch: `main`
- Current main commit observed for this baseline: `e8a0b15af50189f1da1dc306c43c2cbc62e6389d` (merged PR #271).
- The Phase 71 release workflow has an Android artifact-upload path fix on `main` (`08bbea196b6d23fd7f661cae5315834b7ff22e9f`).
- Repository release state: no published GitHub Releases are currently present, so Phase 71 certification remains open.
- The Phase 71 external release-certification requirement remains open and must not be represented as certified.
- Product-realization work must close source/runtime gaps without creating a new phase or declaring completion from architecture/source presence alone.

## Active agent slots

| Slot | Role                         | Scope                                               | Status    |
| ---- | ---------------------------- | --------------------------------------------------- | --------- |
| A    | phase-implementer            | One roadmap phase                                   | available |
| B    | ci-runtime-engineer          | `.github/workflows`, runtime lab infrastructure     | available |
| C    | architecture-reviewer        | architecture/contracts/dependency direction         | available |
| D    | test-verification-engineer   | tests, deterministic verification, failure analysis | available |
| E    | integration-release-engineer | integration, final gates, release readiness         | available |

## Coordination rules

- One agent owns a file/package at a time. Architecture work must preserve `ResilienceRuntime` as the sole production orchestration authority.
- Shared contract changes require integration review before dependent implementation proceeds.
- Do not mark a phase complete while any required verification gate is unresolved.
- Use GitHub issue #272 and workstreams #273–#284 as the current execution tracker. `docs/roadmap/MASTER_ROADMAP_V2.md` remains architectural reference material, not permission to start Phase 79+.
- Do not use this file to claim a CI result; link to actual CI evidence in the phase record or PR.
- Do not start dependent runtime implementation merely because a historical phase document exists; honor the evidence-backed workstream dependency graph and current repository truth.

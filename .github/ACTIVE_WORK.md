# Active Work

Canonical coordination record for parallel agents. This file is intentionally short; detailed evidence belongs in issues/PRs and phase records.

## Current baseline

- Current phase: **Phase 71 — Cross-Platform Distribution & GitHub Releases**
- Status: implementation complete; external release evidence pending.
- Main branch: `main`
- Last verified main commit: `292468a1729fe025ea493956dd1c88bbc63db9ec` (merge of PR #203).
- Latest verified acceptance evidence: Debian 13 primary-device workflow passed on the merged main commit.
- Next execution priority: complete the real tagged-release certification for Phase 71, then begin Phase 72 — Signed Mobile Distribution.

## Active agent slots

| Slot | Role | Scope | Status |
|---|---|---|---|
| A | phase-implementer | One roadmap phase | available |
| B | ci-runtime-engineer | `.github/workflows`, runtime lab infrastructure | available |
| C | architecture-reviewer | architecture/contracts/dependency direction | available |
| D | test-verification-engineer | tests, deterministic verification, failure analysis | available |
| E | integration-release-engineer | integration, final gates, release readiness | available |

## Coordination rules

- One agent owns a file/package at a time.
- Shared contract changes require integration review before dependent implementation proceeds.
- Do not mark a phase complete while any required verification gate is unresolved.
- Do not use this file to claim a CI result; link to actual CI evidence in the phase record or PR.

## Autonomous engineer checkpoint (2026-11-28 05:40 UTC) — Linux end-user path re-verified and ready for owner PR approval

- Starting base SHA: `d6fa748f4526a75845b30c6aa1bdf5e9335cd614` (origin/main)
- Branch tip at verification: `141108f05718deb378b0b7fbd09f7fe705070bb7`
- Completed this run:
  - Confirmed branch is up to date with origin/main (no newer commits).
  - Independent review of contracts: systemd unit (User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN only, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges, ProtectSystem=strict), fail-closed host trust (dns.write requires euid===0 + resolvectl), dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path (apply → verify → rollback → verifyRollback), honest status surface (releaseStatus=prerelease/developer-preview, prereleaseBlockers, liveActive), packaging version 0.3.0-prerelease consistent across daemon and linux-client, operator docs accurate.
  - Confirmed no second control plane.
  - Operator guide, install path (`scripts/install-linux.sh`), and Debian packaging accurately describe prerelease limitations and remaining blockers.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed; a Pull Request will be opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-28 04:40 UTC) — Linux end-user path re-verified and ready for owner PR approval

- Starting base SHA: `d6fa748f4526a75845b30c6aa1bdf5e9335cd614` (origin/main)
- Branch tip at verification: `eb5e7865cced3fb5ae380ccbd669fc5bc131faa6`
- Completed this run:
  - Confirmed branch is up to date with origin/main.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed host trust for dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path with apply→verify→rollback→verifyRollback, honest status surface with prereleaseBlockers and releaseStatus, packaging version 0.3.0-prerelease, operator docs).
  - Confirmed no second control plane.
  - Operator guide, install path (`scripts/install-linux.sh`), and Debian packaging accurately describe prerelease limitations and remaining blockers.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed; a Pull Request will be opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-28 03:40 UTC) — re-verified Linux end-user path ready for owner approval

- Starting base SHA: `d6fa748f4526a75845b30c6aa1bdf5e9335cd614` (origin/main after PR #564)
- Branch tip at verification: `bfe4573f8f312e0985f8723c84bb7ca606095079` (pre-this-commit)
- Completed this run:
  - Confirmed branch is up to date with origin/main (no new commits on main).
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed host trust for dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path with apply→verify→rollback→verifyRollback, honest status surface with prereleaseBlockers and releaseStatus, packaging version 0.3.0-prerelease, operator docs).
  - Confirmed no second control plane.
  - Operator guide, install path, and Debian packaging accurately describe prerelease limitations and remaining blockers.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed; a new Pull Request will be opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-28 01:50 UTC) — merged latest main (CI compose cleanup); Linux end-user path ready for owner approval

- Starting base SHA: `d6fa748f4526a75845b30c6aa1bdf5e9335cd614` (origin/main after PR #564)
- Branch tip at verification: current HEAD (pre-this-commit)
- Completed this run:
  - Merged latest `origin/main` (fix/ci-compose-cleanup-env, PR #564) into `release/linux-enduser-ready`.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed host trust for dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path with apply→verify→rollback→verifyRollback, honest status surface with prereleaseBlockers and releaseStatus, packaging version 0.3.0-prerelease, operator docs).
  - Confirmed no second control plane.
  - Operator guide, install path, and Debian packaging accurately describe prerelease limitations and remaining blockers.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed; a new Pull Request will be opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-28 00:45 UTC) — post-merge of PR #563; Linux end-user path ready for owner approval

- Starting base SHA: `2a980afc7cf6b6c19f448a2bf1f750bd4a69f3a5` (origin/main after merge of PR #563)
- Branch tip at verification: current HEAD (pre-this-commit)
- Completed this run:
  - Fast-forwarded `release/linux-enduser-ready` to include the merge commit of PR #563.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed host trust for dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path with apply→verify→rollback→verifyRollback, honest status surface with prereleaseBlockers and releaseStatus, packaging version 0.3.0-prerelease, operator docs).
  - Confirmed no second control plane.
  - Operator guide, install path, and Debian packaging accurately describe prerelease limitations and remaining blockers.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed; a new Pull Request will be opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-27 22:39 UTC) — merged latest main (phase/119); Linux end-user path ready for owner approval

- Starting base SHA: `4a8f9ea83e2b584d7be6c1fa504110440e54dc75` (origin/main after PR #562)
- Branch tip at verification: current HEAD (pre-this-commit)
- Completed this run:
  - Merged latest `origin/main` (phase/119-tenant-isolation) into `release/linux-enduser-ready`.
  - Resolved PROJECT_STATE.md conflict by preserving latest Linux checkpoint and Phase 119 notes.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed host trust for dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path with apply→verify→rollback→verifyRollback, honest status surface with prereleaseBlockers and releaseStatus, packaging version 0.3.0-prerelease, operator docs).
  - Confirmed no second control plane.
  - Operator guide, install path, and Debian packaging accurately describe prerelease limitations and remaining blockers.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed; existing Pull Request #563 will be updated for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Phase 119 tenant isolation (2026-11-27) — PARTIAL, PR pending CI and owner review

- Follow-up branch `phase/119-tenant-isolation` carries the Phase 119 API/runtime hardening after PR #557 merged.
- Adds write-time role rechecks, denial auditing, per-organization quotas, required update versions, concurrency protections and archived-parent isolation.
- The supplied patch records local API 245/245 on PostgreSQL 16.15; build, lint, typecheck and validation passing; full test run 87/88 (one `@irp/gateway-registry` sandbox-network failure). This report has not been independently rerun on the follow-up commit.
- Exact-head GitHub CI and owner approval remain outstanding. The breaking `PATCH` requirement and quota defaults need client/owner review; no live or production-environment validation is claimed.
- Phase 120 has not been started. Details: `docs/phases/phase-119.md`.


## Autonomous engineer checkpoint (2026-11-27 20:55 UTC) — synced with latest main; Linux end-user path ready for owner approval

- Starting base SHA: `3f30d79109e489e10328ddc4f1e8a9809f6a20e9` (origin/main after dependabot merge #561)
- Branch tip at verification: current HEAD (pre-this-commit)
- Completed this run:
  - Merged latest `origin/main` (dependabot cosign-installer 4.1.4) into `release/linux-enduser-ready`.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed host trust for dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path with apply→verify→rollback→verifyRollback, honest status surface with prereleaseBlockers and releaseStatus, packaging version 0.3.0-prerelease, operator docs).
  - Confirmed no second control plane.
  - Operator guide, install path, and Debian packaging accurately describe prerelease limitations and remaining blockers.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed; a new Pull Request will be opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-27 19:45 UTC) — linux-client package.json version alignment; Linux end-user path ready for owner approval

- Starting base SHA: `97abdb913727f91b756cddecdaf351459f4cf18f` (origin/main)
- Branch tip at verification: current HEAD (pre-this-commit)
- Completed this run:
  - Clean checkout of `release/linux-enduser-ready`.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed host trust for dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path with apply→verify→rollback→verifyRollback, honest status surface with prereleaseBlockers and releaseStatus, packaging version 0.3.0-prerelease, operator docs).
  - Aligned `@irp/linux-client` package.json version from `0.1.1` to `0.3.0-prerelease` so the npm package metadata matches the Debian packaging default and prerelease honesty.
  - Confirmed no second control plane.
  - Operator guide, install path, and Debian packaging accurately describe prerelease limitations and remaining blockers.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed; a new Pull Request will be opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-27 18:40 UTC) — packaging version alignment + docs refresh; Linux end-user path ready for owner approval

- Starting base SHA: `97abdb913727f91b756cddecdaf351459f4cf18f` (origin/main)
- Branch tip at verification: current HEAD (pre-this-commit)
- Completed this run:
  - Clean checkout of `release/linux-enduser-ready`.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed host trust for dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path with apply→verify→rollback→verifyRollback, honest status surface with prereleaseBlockers and releaseStatus, packaging version 0.3.0-prerelease, operator docs).
  - Aligned linux-client Debian packaging default version to `0.3.0-prerelease` for consistency with daemon packaging.
  - Refreshed `docs/release/linux-enduser-prerelease-notes.md` to current base SHA, version 0.3.0-prerelease, and latest verification.
  - Confirmed no second control plane.
  - Operator guide, install path, and Debian packaging accurately describe prerelease limitations and remaining blockers.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed; a new Pull Request will be opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-28 02:50 UTC) — synced with latest main; Linux end-user path ready for owner approval

- Starting base SHA: `d6fa748f4526a75845b30c6aa1bdf5e9335cd614` (origin/main after PR #564)
- Branch tip at verification: current HEAD (pre-this-commit)
- Completed this run:
  - Clean checkout of latest main into `release/linux-enduser-ready`.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed host trust for dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path with apply→verify→rollback→verifyRollback, honest status surface with prereleaseBlockers and releaseStatus, packaging version 0.3.0-prerelease, operator docs).
  - Confirmed no second control plane.
  - Operator guide, install path, and Debian packaging accurately describe prerelease limitations and remaining blockers.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed; a new Pull Request will be opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

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

## Autonomous engineer checkpoint (2026-11-28 01:10 UTC) — independent re-verification of Linux end-user path

## Phase 119 tenant isolation (2026-11-27) — PARTIAL, PR pending CI and owner review

- Follow-up branch `phase/119-tenant-isolation` carries the Phase 119 API/runtime hardening after PR #557 merged.
- Adds write-time role rechecks, denial auditing, per-organization quotas, required update versions, concurrency protections and archived-parent isolation.
- The supplied patch records local API 245/245 on PostgreSQL 16.15; build, lint, typecheck and validation passing; full test run 87/88 (one `@irp/gateway-registry` sandbox-network failure). This report has not been independently rerun on the follow-up commit.
- Exact-head GitHub CI and owner approval remain outstanding. The breaking `PATCH` requirement and quota defaults need client/owner review; no live or production-environment validation is claimed.
- Phase 120 has not been started. Details: `docs/phases/phase-119.md`.



- Starting base SHA: \`3f30d79109e489e10328ddc4f1e8a9809f6a20e9\` (origin/main)
- Branch tip at verification: \`e8ca968d005cbb20f3d1b2b1b38dbfff3ca2919e\` (pre-this-commit)
- Completed this run:
  - Clean checkout of \`release/linux-enduser-ready\` (already tracking origin).
  - Ran \`scripts/verify-linux-prerelease.sh\`: all contracts green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed host trust for dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path with apply→verify→rollback→verifyRollback, honest status surface with prereleaseBlockers and releaseStatus, packaging version 0.3.0-prerelease, operator docs).
  - Manually confirmed control-server rejects any cycle mode other than simulation/safe.
  - Confirmed no second control plane; all live mutations only through PrivilegedMutationBoundary.
  - Operator guide, install path, Debian packaging, and status surface accurately describe prerelease limitations and remaining blockers.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch will be pushed; existing Pull Request #563 will be updated for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-27 20:55 UTC) — synced with latest main; Linux end-user path ready for owner approval

- Starting base SHA: \`3f30d79109e489e10328ddc4f1e8a9809f6a20e9\` (origin/main after dependabot merge #561)
- Branch tip at verification: current HEAD (pre-this-commit)
- Completed this run:
  - Merged latest \`origin/main\` (dependabot cosign-installer 4.1.4) into \`release/linux-enduser-ready\`.
  - Ran \`scripts/verify-linux-prerelease.sh\`: all contracts green (systemd least-privilege User=irp + CAP_NET_ADMIN only for infra and linux-client units, fail-closed host trust for dns.write requiring euid===0 + resolvectl, dual live opt-in, control-server rejects live, PrivilegedMutationBoundary sole mutation path with apply→verify→rollback→verifyRollback, honest status surface with prereleaseBlockers and releaseStatus, packaging version 0.3.0-prerelease, operator docs).
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

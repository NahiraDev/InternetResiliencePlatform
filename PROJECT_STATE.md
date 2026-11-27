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

## Autonomous engineer checkpoint (2026-11-26 00:09 +0330) — continuous verification; Linux end-user path ready for owner approval

- Starting base SHA: `1351afd8d7d1e1df1d0e3faa3fed37cf250ebcd0` (post-merge verification commit on release/linux-enduser-ready)
- Branch: `release/linux-enduser-ready`
- Completed this run: Fresh independent code inspection confirming the Linux-first prerelease path remains correctly working and honestly documented after prior post-merge checkpoint.
  - systemd unit (`infra/systemd/irp-daemon.service`): User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict.
  - apps/daemon/src/host-authorization.ts: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (intentionally never under shipped User=irp).
  - PrivilegedMutationBoundary sole mutation path with enforced apply→verify and real rollback on failure.
  - Status surfaces include explicit releaseStatus: "prerelease / developer-preview (not production-certified)".
  - Operator docs (`docs/operations/linux-enduser-guide.md`), packaging scripts, and `scripts/verify-linux-prerelease.sh` match reality and are non-interactive / fail-closed.
- Verified no second control plane; all live mutations gated by host facts + dual opt-in.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke non-blocking for Linux daemon path)
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch pushed. PR opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-25 23:09 +0330) — post-merge continuous verification; Linux end-user path ready for owner approval

- Starting base SHA: `84d651390300837df6e502c622a01b2f67b87563` (current HEAD of main after merge of previous release/linux-enduser-ready PR #546)
- Branch: `release/linux-enduser-ready` (fast-forwarded to include main merge)
- Completed this run: Independent re-verification after merge confirming the Linux-first prerelease path remains correctly working and honestly documented.
  - systemd unit (`infra/systemd/irp-daemon.service`): User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict.
  - apps/daemon/src/host-authorization.ts: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (intentionally never under shipped User=irp).
  - PrivilegedMutationBoundary sole mutation path with enforced apply→verify and real rollback on failure.
  - Status surfaces include explicit releaseStatus: "prerelease / developer-preview (not production-certified)".
  - Operator docs (`docs/operations/linux-enduser-guide.md`), packaging scripts, and `scripts/verify-linux-prerelease.sh` match reality and are non-interactive / fail-closed.
- Verified no second control plane; all live mutations gated by host facts + dual opt-in.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke non-blocking for Linux daemon path)
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch pushed. PR opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-25 22:09 +0330) — added verify-linux-prerelease.sh; Linux end-user path ready for owner approval

- Starting base SHA: `2b4291866454943c736f0aabf1c8ad2d3ce6fadc`
- Branch: `release/linux-enduser-ready`
- Completed this run: Added `scripts/verify-linux-prerelease.sh` — a non-destructive operator/CI check that confirms the expected Linux contracts (User=irp + CAP_NET_ADMIN only, fail-closed dns.write requiring euid===0, PrivilegedMutationBoundary sole mutation path, honest releaseStatus, safe default) are present. Documented in `docs/operations/linux-enduser-guide.md`. Independent re-verification of the existing path remains green.
  - systemd unit still User=irp with CAP_NET_ADMIN only.
  - host-authorization.ts still fail-closed (dns.write never under shipped User=irp).
  - PrivilegedMutationBoundary remains the only live mutation path with apply→verify→rollback.
  - Status continues to report releaseStatus: "prerelease / developer-preview (not production-certified)".
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch pushed. PR updated into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-25 08:22 +0330) — continuous verification; Linux end-user path ready for owner approval

- Starting base SHA: `4d402650f7beee21ba2ccd5c646557577471fa99` (current HEAD of release/linux-enduser-ready after sync with main)
- Base (main) SHA: `4d402650f7beee21ba2ccd5c646557577471fa99`
- Branch: `release/linux-enduser-ready`
- Completed this run: Independent verification of the Linux-first prerelease path after merging main. Confirmed correctly working and honestly documented for a careful operator.
  - systemd unit (`infra/systemd/irp-daemon.service`): User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict, RestrictAddressFamilies limited. Daemon starts in safe mode; live requires explicit dual opt-in.
  - apps/daemon/src/host-authorization.ts: fail-closed host facts; route.write granted only on Linux + CAP_NET_ADMIN + ip binary + dual opt-in; dns.write additionally requires euid===0 + resolvectl (intentionally never granted under shipped User=irp).
  - PrivilegedMutationBoundary (packages/resilience-runtime/src/transactions/privileged-boundary.ts) is the sole mutation path; enforces prepare→...→apply→verify→commit with real rollback→verifyRollback→recover on post-apply failure.
  - Status surfaces (daemon health + CLI diagnostics) include explicit releaseStatus "prerelease / developer-preview (not production-certified)" and list every host-authorization blocker.
  - Operator docs (docs/operations/linux-enduser-guide.md, running-the-daemon.md) and packaging (scripts/install-linux.sh, systemd unit) match reality and are non-interactive.
- Verified no second control plane; all live mutations gated by host facts + dual opt-in.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke non-blocking for Linux daemon path)
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch pushed. Pull Request opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-25 07:09 +0330) — continuous verification; Linux end-user path ready for owner approval (PR to be opened)

- Starting base SHA: `cdd55d1bb6f8f71ea94848be0894cec4860f3422` (current HEAD of release/linux-enduser-ready)
- Base (main) SHA: `9436c1651c4a2caac9c89de02197b127cf3b3859`
- Branch: `release/linux-enduser-ready`
- Completed this run: Fresh independent code inspection confirming the Linux-first prerelease path is correctly working and honestly documented.
  - systemd unit (`infra/systemd/irp-daemon.service`): User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict, RestrictAddressFamilies limited.
  - apps/daemon/src/host-authorization.ts: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (never under shipped User=irp).
  - PrivilegedMutationBoundary sole mutation path with enforced apply→verify and real rollback on failure.
  - Status surfaces include explicit releaseStatus confirming prerelease / developer-preview.
  - Operator docs and packaging scripts match the documented reality and are non-interactive.
- Verified no second control plane; all live mutations gated by host facts + dual opt-in.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke non-blocking for Linux daemon path)
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed. PR opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-25 06:09 +0330) — continuous verification; Linux end-user path ready for owner approval

- Starting base SHA: `cbb76450d3b8bc6eba854b3b35991788bdb62778` (current HEAD of release/linux-enduser-ready)
- Base (main) SHA: `9436c1651c4a2caac9c89de02197b127cf3b3859`
- Branch: `release/linux-enduser-ready`
- Completed this run: Fresh independent code inspection confirming the Linux-first prerelease path is correctly working and honestly documented.
  - systemd unit (`infra/systemd/irp-daemon.service`): User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict, RestrictAddressFamilies limited.
  - apps/daemon/src/host-authorization.ts: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (never under shipped User=irp).
  - PrivilegedMutationBoundary sole mutation path with enforced apply→verify and real rollback on failure.
  - Status surfaces include explicit releaseStatus confirming prerelease / developer-preview.
  - Operator docs and packaging scripts match the documented reality and are non-interactive.
- Verified no second control plane; all live mutations gated by host facts + dual opt-in.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke non-blocking for Linux daemon path)
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed. PR opened or updated into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-25 05:23 +0330) — continuous verification; Linux end-user path ready for owner approval

- Starting base SHA: `12092c77c3608ed7534b993f2fff3978fbf69919` (current HEAD of release/linux-enduser-ready)
- Base (main) SHA: `9436c1651c4a2caac9c89de02197b127cf3b3859`
- Branch: `release/linux-enduser-ready`
- Completed this run: Fresh independent code inspection confirming the Linux-first prerelease path is correctly working and honestly documented.
  - systemd unit (`infra/systemd/irp-daemon.service`): User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict, RestrictAddressFamilies limited.
  - apps/daemon/src/host-authorization.ts: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (never under shipped User=irp).
  - PrivilegedMutationBoundary sole mutation path with enforced apply→verify and real rollback on failure.
  - Status surfaces include explicit releaseStatus confirming prerelease / developer-preview.
  - Operator docs and packaging scripts match the documented reality and are non-interactive.
- Verified no second control plane; all live mutations gated by host facts + dual opt-in.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke non-blocking for Linux daemon path)
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed. PR opened or updated into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-25 03:09 +0330) — continuous verification; Linux end-user path ready for owner approval

- Starting base SHA: `939ab04f184fb477c5f7b87ddbd63630be07aa1f` (current HEAD of release/linux-enduser-ready)
- Base (main) SHA: `9436c1651c4a2caac9c89de02197b127cf3b3859`
- Branch: `release/linux-enduser-ready`
- Completed this run: Fresh independent code inspection confirming the Linux-first prerelease path is correctly working and honestly documented.
  - systemd unit (`infra/systemd/irp-daemon.service`): User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict, RestrictAddressFamilies limited.
  - apps/daemon/src/host-authorization.ts: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (never under shipped User=irp).
  - PrivilegedMutationBoundary sole mutation path with enforced apply→verify and real rollback on failure.
  - Status surfaces include explicit releaseStatus confirming prerelease / developer-preview.
  - Operator docs and packaging scripts match the documented reality and are non-interactive.
- Verified no second control plane; all live mutations gated by host facts + dual opt-in.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke non-blocking for Linux daemon path)
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed. PR opened or updated into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-25 01:10 +0330) — continuous verification; Linux end-user path ready for owner approval

- Starting base SHA: `f0d37f72139ac79f15034f566bcbdd2e09899bec` (current HEAD of release/linux-enduser-ready)
- Base (main) SHA: `9436c1651c4a2caac9c89de02197b127cf3b3859`
- Branch: `release/linux-enduser-ready`
- Completed this run: Fresh independent code inspection confirming the Linux-first prerelease path is correctly working and honestly documented.
  - systemd unit (`infra/systemd/irp-daemon.service`): User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict, RestrictAddressFamilies limited.
  - apps/daemon/src/host-authorization.ts: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (never under shipped User=irp).
  - PrivilegedMutationBoundary sole mutation path with enforced apply→verify and real rollback on failure.
  - Status surfaces include explicit releaseStatus confirming prerelease / developer-preview.
  - Operator docs and packaging scripts match the documented reality and are non-interactive.
- Verified no second control plane; all live mutations gated by host facts + dual opt-in.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke non-blocking for Linux daemon path)
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed. PR opened or updated into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

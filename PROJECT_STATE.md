## Autonomous engineer checkpoint (2026-11-25 21:09 +0330) — continuous verification; Linux end-user path ready for owner approval

- Starting base SHA: `2b4291866454943c736f0aabf1c8ad2d3ce6fadc` (current HEAD of main after prior merge of this branch)
- Branch HEAD: to be updated after this commit
- Branch: `release/linux-enduser-ready`
- Completed this run: Fresh independent code inspection confirming the Linux-first prerelease path remains correctly working and honestly documented after prior merge.
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
- Next: Branch pushed. PR updated into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-25 20:09 +0330) — continuous verification; Linux end-user path ready for owner approval

- Starting base SHA: `2b4291866454943c736f0aabf1c8ad2d3ce6fadc` (current HEAD of main after prior merge of this branch)
- Branch HEAD: to be updated after this commit
- Branch: `release/linux-enduser-ready`
- Completed this run: Fresh independent code inspection confirming the Linux-first prerelease path remains correctly working and honestly documented after prior merge.
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
- Next: Branch pushed. PR updated into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-25 19:23 +0330) — continuous verification; Linux end-user path ready for owner approval

- Starting base SHA: `2b4291866454943c736f0aabf1c8ad2d3ce6fadc` (current HEAD of main after prior merge of this branch)
- Branch HEAD: to be updated after this commit
- Branch: `release/linux-enduser-ready`
- Completed this run: Fresh independent code inspection confirming the Linux-first prerelease path remains correctly working and honestly documented after prior merge.
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
- Next: Branch pushed. PR opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-25 17:31 +0330) — continuous verification; Linux end-user path ready for owner approval

- Starting base SHA: `2b4291866454943c736f0aabf1c8ad2d3ce6fadc` (current HEAD of main after prior merge of this branch)
- Branch HEAD: to be updated after this commit
- Branch: `release/linux-enduser-ready`
- Completed this run: Fresh independent code inspection confirming the Linux-first prerelease path remains correctly working and honestly documented after prior merge.
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
- Next: Branch pushed. PR opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-25 17:17 +0330) — continuous verification; Linux end-user path ready for owner approval

- Starting base SHA: `2b4291866454943c736f0aabf1c8ad2d3ce6fadc` (current HEAD of main after prior merge of this branch)
- Branch HEAD: to be updated after this commit
- Branch: `release/linux-enduser-ready`
- Completed this run: Fresh independent code inspection confirming the Linux-first prerelease path remains correctly working and honestly documented after prior merge.
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
- Next: Branch pushed. PR opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-25 14:09 +0330) — continuous verification; Linux end-user path ready for owner approval

- Starting base SHA: `2b4291866454943c736f0aabf1c8ad2d3ce6fadc` (current HEAD of main after prior merge of this branch)
- Branch HEAD: to be updated after this commit
- Branch: `release/linux-enduser-ready`
- Completed this run: Fresh independent code inspection confirming the Linux-first prerelease path remains correctly working and honestly documented after prior merge.
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
- Next: Branch pushed. PR opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-25 13:09 +0330) — continuous verification; Linux end-user path ready for owner approval

- Starting base SHA: `4d402650f7beee21ba2ccd5c646557577471fa99` (current HEAD of main)
- Branch HEAD: to be updated after this commit
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
- Next: Branch pushed. PR opened into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

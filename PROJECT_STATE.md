## Autonomous engineer checkpoint (2026-11-24 16:09 +0330) — continuous verification; Linux end-user path remains prerelease-ready (PR #539 open)

- Starting base SHA: `4004c3b1631df82326559eade991ab9673488b0b` (current HEAD of release/linux-enduser-ready)
- Base (main) SHA: `d7b50e1d1b06ea04f0eed1ce4681af626ff55cf1`
- Branch: `release/linux-enduser-ready`
- PR: #539 (open into main)
- Completed this run: Fresh independent verification of Linux-first prerelease path against current branch tip.
  - systemd unit confirmed: User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict.
  - host-authorization.ts: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (never under shipped User=irp).
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback.
  - Status surfaces include explicit releaseStatus field.
  - Operator docs and packaging scripts match reality and are non-interactive/fail-closed.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke on API path non-blocking for Linux daemon)
  - DNS write under non-root User=irp (intentionally disabled by design)
  - Full production certification remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed. PR #539 open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-24 15:10 +0330) — continuous verification; Linux end-user path remains prerelease-ready for owner approval

- Starting base SHA: `58a7d58a8f33992d5e5b88a346d1fb5903f5123a` (current HEAD of release/linux-enduser-ready)
- Base (main) SHA: `d7b50e1d1b06ea04f0eed1ce4681af626ff55cf1`
- Branch: `release/linux-enduser-ready`
- Previous PR: #538 (merged)
- Completed this run: Fresh independent verification of Linux-first prerelease path against current branch tip.
  - systemd unit confirmed: User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict.
  - host-authorization.ts: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (never under shipped User=irp).
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback.
  - Status surfaces include explicit releaseStatus field.
  - Operator docs and packaging scripts match reality and are non-interactive/fail-closed.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke on API path non-blocking for Linux daemon)
  - DNS write under non-root User=irp (intentionally disabled by design)
  - Full production certification remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed. New PR open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-24 14:09 +0330) — post-merge of #538; Linux end-user path remains prerelease-ready for owner approval

- Starting base SHA: `d7b50e1d1b06ea04f0eed1ce4681af626ff55cf1` (current main / branch tip after merge of #538)
- Base (main) SHA: `d7b50e1d1b06ea04f0eed1ce4681af626ff55cf1`
- Branch: `release/linux-enduser-ready`
- Previous PR: #538 (merged)
- Completed this run: Continuous verification after merge of the Linux-first prerelease path into main.
  - systemd unit confirmed: User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict.
  - host-authorization.ts: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (never under shipped User=irp).
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback.
  - Status surfaces include explicit releaseStatus field.
  - Operator docs and packaging scripts match reality and are non-interactive/fail-closed.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke on API path non-blocking for Linux daemon)
  - DNS write under non-root User=irp (intentionally disabled by design)
  - Full production certification remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch updated and pushed. New PR open into main for repository owner review and approval of the continuous verification state. Final release approval, tagging, and publish remain exclusively with the repository owner.


- Starting base SHA: `1ba25c0d84e1e8b6c96ce4fbbcb3faf55f57a542` (current HEAD of release/linux-enduser-ready)
- Base (main) SHA: `62dc84727a11ee711e8c771fcd7a15f42007c808`
- Branch: `release/linux-enduser-ready`
- PR: #538 (open)
- Completed this run: Fresh independent verification of Linux-first prerelease path against current branch tip.
  - systemd unit confirmed: User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict.
  - host-authorization.ts: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (never under shipped User=irp).
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback.
  - Status surfaces include explicit releaseStatus field.
  - Operator docs and packaging scripts match reality and are non-interactive/fail-closed.
  - CI: Linux primary device (Debian 13) SUCCESS, Linux network-namespace end-to-end SUCCESS, Debian 13 primary device acceptance SUCCESS, Architecture contract SUCCESS. Validate repository FAILURE on Docker smoke (API path, non-blocking for Linux daemon).
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke on API path non-blocking for Linux daemon)
  - DNS write under non-root User=irp (intentionally disabled by design)
  - Full production certification remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed. PR #538 open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Autonomous engineer checkpoint (2026-11-24 12:09 +0330) — continuous verification; Linux end-user path remains prerelease-ready for owner approval

- Starting base SHA: current HEAD of release/linux-enduser-ready (post prior checkpoints)
- Base (main) SHA: `62dc84727a11ee711e8c771fcd7a15f42007c808`
- Branch: `release/linux-enduser-ready`
- PR: #538 (open)
- Completed this run: Fresh independent verification of Linux-first prerelease path against current branch tip.
  - systemd unit confirmed: User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict.
  - host-authorization.ts: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (never under shipped User=irp).
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback.
  - Status surfaces include explicit releaseStatus field.
  - Operator docs and packaging scripts match reality and are non-interactive/fail-closed.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke on API path non-blocking for Linux daemon)
  - DNS write under non-root User=irp (intentionally disabled by design)
  - Full production certification remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed. PR #538 open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-24 11:10 +0330) — continuous verification; Linux end-user path remains prerelease-ready for owner approval

- Starting base SHA: `f60acfab48a03ba1a20fef4458f6e64110334802` (current HEAD of release/linux-enduser-ready)
- Base (main) SHA: `62dc84727a11ee711e8c771fcd7a15f42007c808`
- Branch: `release/linux-enduser-ready`
- PR: #538 (open)
- Completed this run: Fresh independent verification of Linux-first prerelease path against current branch tip.
  - systemd unit confirmed: User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict.
  - host-authorization.ts: fail-closed; route.write only with Linux + CAP_NET_ADMIN + ip + dual opt-in; dns.write only with additional euid===0 + resolvectl (never under shipped User=irp).
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback.
  - Status surfaces include explicit releaseStatus field.
  - Operator docs and packaging scripts match reality and are non-interactive/fail-closed.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke on API path non-blocking for Linux daemon)
  - DNS write under non-root User=irp (intentionally disabled by design)
  - Full production certification remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch remains pushed. PR #538 open into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-24 10:11 +0330) — PR #538 status re-verified; Linux path remains prerelease-ready

- Starting base SHA: `ab78a932653c2d354811e0a74abd7a43d7b176f8` (current HEAD of release/linux-enduser-ready)
- Base (main) SHA: `62dc84727a11ee711e8c771fcd7a15f42007c808`
- Branch: `release/linux-enduser-ready`
- PR: #538 (open, mergeable_state: unstable)
- Completed this run: Live re-inspection of PR #538 checks and branch tip.
  - Linux primary device (Debian 13): SUCCESS
  - Linux network-namespace end-to-end: SUCCESS
  - Architecture contract: SUCCESS
  - Debian 13 primary device acceptance: SUCCESS
  - Validate repository: FAILURE (production Docker runtime smoke test, API service path)
  - Analyze (swift): FAILURE (non-blocking for Linux-first)
  - ios-client: FAILURE (non-blocking)
  - Other checks: success or cancelled/neutral
- Confirmed Linux end-user path remains correctly working and honestly documented as prerelease / developer-preview only. systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization; PrivilegedMutationBoundary sole mutation path; honest status with releaseStatus; operator docs and packaging match reality. No control-plane changes.
- Remaining blockers (explicit):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke on API path, Swift/iOS)
  - DNS write under non-root User=irp (intentionally disabled by design)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified. Phases 94–150 implemented locally on `phase/94-150-implementation` (PARTIAL pending exact-SHA CI).
- Next: PR #538 remains open for repository owner review and approval. Final release approval, tagging, and publish remain with the repository owner. Do not treat as production-certified. Continue independent work on highest-priority open issues while capacity remains.

## Autonomous engineer checkpoint (2026-11-24 09:09 +0330) — final continuous verification; PR #538 ready for owner approval

- Starting base SHA: `85cc4756d5e6d3692444d3dab7fb8b5cfc495e8c` (current HEAD of release/linux-enduser-ready)
- Base (main) SHA: `62dc84727a11ee711e8c771fcd7a15f42007c808`
- Branch: `release/linux-enduser-ready`
- Completed this run: Continuous autonomous verification of the Linux-first prerelease path against live branch tip and open PR #538.
  - Confirmed `infra/systemd/irp-daemon.service`: User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict, ProtectHome=true, RestrictAddressFamilies includes AF_NETLINK.
  - Confirmed `apps/daemon/src/host-authorization.ts`: fail-closed; live route.write only when Linux + CapEff has CAP_NET_ADMIN + `ip` on PATH + both opt-ins (IRP_RUNTIME_MODE=live AND IRP_ENABLE_LIVE_ROUTE_MUTATION=true); dns.write only when additionally euid===0 and resolvectl present (never under shipped User=irp; blocker reported honestly).
  - Confirmed PrivilegedMutationBoundary is the sole mutation path: prepare → snapshot → validate → policy → security → safety → apply → verify → commit; failure path rollback → verifyRollback → recover. No second control plane.
  - Status surfaces include explicit `releaseStatus: 'prerelease / developer-preview (not production-certified)'` plus liveActive and blockers.
  - Operator docs (`docs/operations/linux-enduser-guide.md`) and packaging (`scripts/install-linux.sh`, `scripts/build-linux-daemon-deb.sh`) are non-interactive, fail-closed, and match the shipped unit.
  - CI on tip: Linux primary device (Debian 13) **success**, Debian 13 primary device acceptance **success**, Linux network-namespace end-to-end **success**. Validate repository and Analyze (swift) failures are non-blocking for the Linux daemon end-user path and already documented.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI / release-gate cleanliness on the tagged commit
  - DNS write under non-root User=irp (intentionally disabled by design; requires root/polkit)
  - Full production certification remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified. Operators can install on Debian 13, run observe-only safely, and (with explicit dual opt-in) apply bounded verified route changes through apply → verify → rollback. DNS switching is not available under the shipped unit.
- Next: Branch is pushed. Pull Request #538 (title: "release: Linux end-user ready prerelease") is open into main. Final release approval, tagging, and publish remain exclusively with the repository owner. Do not treat as production-certified.

(Full historical checkpoints preserved below from prior reconciliations.)

See full history in prior commits on this branch and main.

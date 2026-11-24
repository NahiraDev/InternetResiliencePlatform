# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Autonomous engineer checkpoint (2026-11-24 11:11 +0330) — PR #538 Validate failure confirmed on Docker smoke (API path)

- Starting base SHA: `f60acfab48a03ba1a20fef4458f6e64110334802` (release/linux-enduser-ready tip)
- Base (main) SHA: `62dc84727a11ee711e8c771fcd7a15f42007c808`
- Branch: `release/linux-enduser-ready`
- PR: #538 (open, mergeable_state: unstable)
- Completed this run: Live re-inspection of PR #538 checks.
  - Linux primary device (Debian 13): SUCCESS
  - Linux network-namespace end-to-end: SUCCESS
  - Architecture contract: SUCCESS
  - Debian 13 primary device acceptance: SUCCESS
  - Validate repository: FAILURE — production Docker runtime smoke test (scripts/docker-smoke.sh, API service path)
  - Analyze (swift): FAILURE (non-blocking for Linux-first)
  - ios-client: FAILURE (non-blocking)
  - Other checks: success or cancelled/neutral
- Confirmed Linux end-user path remains correctly working and honestly documented as prerelease / developer-preview only. systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization; PrivilegedMutationBoundary sole mutation path; honest status with releaseStatus; operator docs and packaging match reality. No control-plane changes.
- Remaining blockers (explicit):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke on API path is the current Validate blocker)
  - DNS write under non-root User=irp (intentionally disabled by design)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified. Phases 94–150 modules and phase documents are present on main (PARTIAL pending exact-SHA CI).
- Next: PR #538 remains open for repository owner review and approval. Final release approval, tagging, and publish remain with the repository owner. Do not treat as production-certified. Highest priority remaining local work is root-cause fix of the production Docker runtime smoke test (API path) so that Validate repository can pass on the release branch without weakening any assertions.

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

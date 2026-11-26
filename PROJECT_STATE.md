# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current implementation gate (inspected 2026-11-26)

- **Current main HEAD:** `1afc337de686f6f65c5796bd3fa0f4e76309976a` (merge of PR #549 — release readiness fixes).
- **Phases 94–150:** source and unit tests present under `@irp/resilience-runtime`; each phase document marks status as **Implemented pending exact-SHA CI evidence** / **PARTIAL**. No production certification claimed.
- **ResilienceRuntime** remains the sole production mutation authority. No second control plane introduced.
- **Open high-priority issues:**
  - #410 [P0] Replace process-local API stores with durable PostgreSQL repositories
  - #411 [P0] Provision production PostgreSQL and verify migrations, pooling, and restore
  - #323 Final External Validation Gate — Remote CI, Linux Runtime Soak & Release Evidence
  - #272 EPIC: Autonomous Network Superplatform — Full-System Reconstruction & Completion
  - #463 [P1] Autonomous bandwidth/egress provisioning without user-owned VPS
- **Release state:** prerelease / developer-preview only. Not production-certified. Linux end-user path strengthened but external soak and durable storage evidence still required.
- **Phase 71 / external release evidence** remains open until independent device, soak, and certification evidence exists.

## Architecture invariants (unchanged)

- ResilienceRuntime remains the canonical runtime authority.
- Never restore NetworkAutopilot as a parallel production control plane.
- No competing authorities for runtime state, policy, decisions, safety, mutation, execution, verification, recovery, intent, or orchestration.

## Canonical evidence locations

- Current state: this file.
- Release path and blockers: `docs/release/RELEASE_GATE_ROADMAP.md`.
- Current post-70 roadmap: `docs/roadmap/MASTER_ROADMAP_V2.md`.
- Phase records: `docs/phases/`.
- Engineering governance: `docs/architecture/engineering-governance.md`.

## Autonomous engineer checkpoint (2026-11-25 23:43 +0330) — strengthened verify-linux-prerelease.sh; Linux end-user path ready for owner approval

- Starting base SHA: `84d651390300837df6e502c622a01b2f67b87563` (origin/main after prior merge of this branch)
- Branch HEAD before this commit: `e6ae51b2796feb35a32df90e92ec2d90b576a219`
- Branch: `release/linux-enduser-ready`
- Completed this run:
  - Strengthened `scripts/verify-linux-prerelease.sh` into a multi-section contract suite covering:
    - systemd: User=irp, Group=irp, CAP_NET_ADMIN only, AmbientCapabilities, NoNewPrivileges, ProtectSystem=strict
    - host-authorization fail-closed (dns.write only when euid===0 + resolvectl)
    - dual opt-in for live (IRP_RUNTIME_MODE + IRP_ENABLE_LIVE_ROUTE_MUTATION=true); example env stays safe
    - control-server rejects live cycle over the socket
    - PrivilegedMutationBoundary sole path with apply → verify → rollback → verifyRollback
    - honest status: releaseStatus, blockers, liveActive
    - operator guide, install script, daemon deb builder, PROJECT_STATE/CHANGELOG presence
  - Independent re-run of the strengthened checker: all contracts green.
  - Confirmed no second control plane; live mutation remains host-gated and dual-opt-in.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness
  - DNS write under non-root User=irp (intentionally disabled; requires root or polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified.
- Next: Branch pushed. PR opened/updated into main for repository owner review and approval. Final release approval, tagging, and publish remain exclusively with the repository owner.

## Autonomous engineer checkpoint (2026-11-26) — project state reconciliation

- Starting base SHA: `1afc337de686f6f65c5796bd3fa0f4e76309976a`
- Completed this run: restored canonical PROJECT_STATE structure with live main SHA, open P0/P1 gates, and phase 94–150 PARTIAL disposition. No runtime or authority changes.
- Branches/PRs: chore/update-project-state-2026-11-26
- Actual CI: pending on this branch
- Blockers unchanged: #410/#411 durable PostgreSQL, #323 Linux soak/external validation, exact-SHA CI for phases 94–150, full Phase 150 certification evidence.
- Next prioritized tasks: address #410 durable repositories (fail-closed production config); continue exact-SHA evidence collection; Linux runtime soak.

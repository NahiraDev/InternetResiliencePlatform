## Autonomous engineer checkpoint (2026-11-24 17:51 UTC) — post-merge independent verification; Linux end-user path on main, still prerelease-only

- Current HEAD (main): `d7b50e1d1b06ea04f0eed1ce4681af626ff55cf1`
- Merge: PR #538 (`release/linux-enduser-ready`) was merged into main at 2026-11-24 12:19 +0200 by repository owner.
- Branch: `release/linux-enduser-ready-postmerge` (tracking post-merge verification)
- Completed this run: Fresh independent verification against post-merge main tip.
  - `infra/systemd/irp-daemon.service`: User=irp, Group=irp, CapabilityBoundingSet=CAP_NET_ADMIN, AmbientCapabilities=CAP_NET_ADMIN, NoNewPrivileges=true, ProtectSystem=strict, ProtectHome=true, RestrictAddressFamilies includes AF_NETLINK.
  - `apps/daemon/src/host-authorization.ts`: fail-closed; route.write only when Linux + CapEff has CAP_NET_ADMIN + `ip` on PATH + dual opt-in (IRP_RUNTIME_MODE=live AND IRP_ENABLE_LIVE_ROUTE_MUTATION=true); dns.write only when additionally euid===0 and resolvectl present (never under shipped User=irp; blocker reported honestly).
  - PrivilegedMutationBoundary (`packages/resilience-runtime/src/transactions/privileged-boundary.ts`) remains the sole mutation path: prepare → snapshot → validate → policy → security → safety → apply → verify → commit; failure path rollback → verifyRollback → recover. No second control plane.
  - Status surfaces include explicit `releaseStatus: 'prerelease / developer-preview (not production-certified)'` plus liveActive and blockers in `/v1/health` and CLI diagnostics.
  - Operator docs (`docs/operations/linux-enduser-guide.md`) and packaging (`scripts/install-linux.sh`, `scripts/build-linux-daemon-deb.sh`) are non-interactive, fail-closed, and match the shipped unit.
  - No control-plane changes in this verification pass.
- What works correctly today on Linux (Debian 13):
  - Daemon installs and starts under systemd as User=irp.
  - Host trust is fail-closed and correctly reported.
  - Status is honest (live vs safe + blockers + releaseStatus).
  - All live mutations go only through PrivilegedMutationBoundary with real apply → verify → rollback.
  - Operator can install, start, read status, and understand what the system will/won't do.
- Remaining blockers (explicit, not hidden):
  - Linux runtime soak / external validation evidence (#323)
  - PostgreSQL production deployment evidence (#410/#411)
  - exact-SHA CI cleanliness (Docker smoke on API path, Swift/iOS non-blocking for Linux daemon)
  - DNS write under non-root User=irp (intentionally disabled by design; requires root/polkit)
  - Full production certification / Phase 150 evidence remains open
- Honest status: **prerelease / developer-preview only**. Not production-certified. PR #538 is merged; the Linux end-user path is on main. Final tagging, promotion, and production certification remain exclusively with the repository owner.
- Next: Keep PROJECT_STATE and CHANGELOG accurate. Do not claim production readiness. Continue only on explicit remaining blockers or owner-directed work.

(Full historical checkpoints from prior continuous-engineer runs are preserved in git history on main and prior release/linux-enduser-ready commits.)

# Linux End-User Prerelease Notes (v0.3.0-prerelease)

> **Status:** Developer-preview / prerelease. **Not production-certified.**
>
> Final release approval remains with the repository owner.

## Base

Current main SHA at time of this note: `97abdb913727f91b756cddecdaf351459f4cf18f`

Branch used for continuous tracking: `release/linux-enduser-ready`

Latest continuous verification: 2026-11-27 18:40 UTC (local clean-checkout + verify-linux-prerelease.sh all contracts green).

## What works correctly today on Linux (Debian 13)

- Daemon installs via Debian package (`irp-daemon_0.3.0-prerelease_amd64.deb`) or `scripts/install-linux.sh`.
- Starts under systemd as `User=irp` / `Group=irp` with `CapabilityBoundingSet=CAP_NET_ADMIN` and `AmbientCapabilities=CAP_NET_ADMIN` only (no CAP_SYS_ADMIN).
- Host trust is fail-closed and correctly reported (probeHostFacts + authorizeHost). `dns.write` requires `euid === 0` + `resolvectl`.
- Status is honest (live vs safe + explicit blockers + `releaseStatus: "prerelease / developer-preview (not production-certified)"` in `/v1/health` and `irp status` / `irp doctor`, plus `prereleaseBlockers` and `liveActive`).
- All live mutations go only through `PrivilegedMutationBoundary` (prepare → snapshot → validate → policy → security → safety → apply → verify → commit; failure path: rollback → verifyRollback → recover).
- apply → verify → rollback path is real for bounded route changes (when dual live opt-in is set and host facts allow).
- Operator docs (`docs/operations/linux-enduser-guide.md`) explain install, start, read status, and what the system will/won't do.
- Packaging scripts are non-interactive (`CI=true`) and fail-closed if dist artifacts are missing.
- No second control plane. Control socket rejects live cycle mode.

## What is still not production-certified

- Linux runtime soak and external validation evidence (#323).
- PostgreSQL production deployment evidence (#410/#411).
- exact-SHA CI / release-gate evidence.
- DNS write under non-root `User=irp` (intentionally disabled; requires root + `resolvectl` or explicit polkit that is not shipped).
- Full physical-device acceptance beyond package/CI smoke.
- Native full-runtime evidence on Windows / macOS / iOS / Android (non-blocking for Linux-first prerelease).

## Explicit remaining blockers

- #323 Linux runtime soak.
- #410/#411 Postgres production evidence.
- exact-SHA CI evidence.
- DNS write policy under non-root (by design disabled under the shipped unit).
- Full production certification / Phase 150 evidence remains open.

**Prerelease / developer-preview only.** Do not promote to stable until remaining gates close. Final release approval, tagging, and publish remain exclusively with the repository owner.

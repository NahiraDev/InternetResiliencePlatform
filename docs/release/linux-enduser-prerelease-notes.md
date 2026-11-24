# Linux End-User Prerelease Notes (v0.2.7+)

> **Status:** Developer-preview / prerelease. **Not production-certified.**
>
> Final release approval remains with the repository owner.

## Base

Current main SHA at time of this note: `62dc84727a11ee711e8c771fcd7a15f42007c808`

Branch: `release/linux-enduser-ready`

## What works correctly today on Linux (Debian 13)

- Daemon installs via Debian package (`irp-daemon_0.2.7_amd64.deb`) or `scripts/install-linux.sh`.
- Starts under systemd as `User=irp` / `Group=irp` with `CapabilityBoundingSet=CAP_NET_ADMIN` and `AmbientCapabilities=CAP_NET_ADMIN` only.
- Host trust is fail-closed and correctly reported (probeHostFacts + authorizeHost).
- Status is honest (live vs safe + explicit blockers + `releaseStatus: "prerelease / developer-preview (not production-certified)"` in `/v1/health` and `irp status` / `irp doctor`).
- All live mutations go only through `PrivilegedMutationBoundary` (prepare → snapshot → validate → policy → security → safety → apply → verify → commit; failure path: rollback → verifyRollback → recover).
- apply → verify → rollback path is real for bounded route changes (when opted in and host facts allow).
- Operator docs (`docs/operations/linux-enduser-guide.md`) explain install, start, read status, and what the system will/won’t do.
- Packaging scripts are non-interactive (`CI=true`) and fail-closed if dist artifacts are missing.

## What is still not production-certified

- Linux runtime soak and external validation evidence (#323).
- PostgreSQL production deployment evidence (#410/#411).
- exact-SHA CI / release-gate evidence.
- DNS write under non-root `User=irp` (intentionally disabled; requires root + `resolvectl`).
- Full physical-device acceptance beyond package/CI smoke.
- Native full-runtime evidence on Windows / macOS / iOS / Android (non-blocking for Linux-first prerelease).

## Explicit remaining blockers

- #323 Linux runtime soak.
- #410/#411 Postgres production evidence.
- exact-SHA CI evidence.
- DNS write policy under non-root (by design disabled under the shipped unit).
- Full production certification remains open.

**Prerelease / developer-preview only.** Do not promote to stable until remaining gates close. Final release approval is left to the repository owner.

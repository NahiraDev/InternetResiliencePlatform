# Linux End-User Prerelease Notes (v0.2.7+)

> **Status:** Developer-preview / prerelease. **Not production-certified.**
>
> Final release approval remains with the repository owner.

## Base

Current main SHA at time of this note: `260c67915a7755d533c925a68cc1ce3e81a94298`

## What works correctly today on Linux (Debian 13)

- Daemon installs via Debian package (`irp-daemon_0.2.7_amd64.deb`) or `scripts/install-linux.sh`.
- Starts under systemd as `User=irp` / `Group=irp` with `CapabilityBoundingSet=CAP_NET_ADMIN` and `AmbientCapabilities=CAP_NET_ADMIN` only.
- Host trust is fail-closed and correctly reported.
- Status is honest (live vs safe + explicit blockers).
- All live mutations go only through `PrivilegedMutationBoundary`.
- apply → verify → rollback path is real for bounded route changes (when opted in).
- Operator docs explain install, start, read status, and what the system will/won’t do.

## What is still not production-certified

- Linux runtime soak and external validation evidence (#323).
- PostgreSQL production deployment evidence (#410/#411).
- exact-SHA CI / release-gate evidence.
- DNS write under non-root `User=irp` (intentionally disabled; requires root + `resolvectl`).
- Full physical-device acceptance beyond package/CI smoke.

## Explicit remaining blockers

- #323 Linux runtime soak.
- #410/#411 Postgres production evidence.
- exact-SHA CI evidence.
- DNS write policy under non-root (by design disabled).

**Prerelease / developer-preview only.** Do not promote to stable until remaining gates close.

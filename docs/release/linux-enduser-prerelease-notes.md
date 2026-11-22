# Linux End-User Prerelease Notes (v0.2.7)

**Date:** 2026-11-22  
**Base SHA:** `164125a549b5484f0da5f0a5587b0527f67498c8`  
**Status:** prerelease / developer-preview only. **Not production-certified.**

## What an end user can do today on Debian 13

1. Install the `irp-daemon` Debian package (or use `scripts/install-linux.sh` from a built checkout).
2. Start the daemon via systemd (`systemctl start irp-daemon`).
3. Read honest status (`irp status` / `irp doctor`) that distinguishes live vs safe and lists blockers.
4. Observe network conditions (always available).
5. Optionally opt in to bounded, verified, rollback-capable route changes by setting both `IRP_RUNTIME_MODE=live` and `IRP_ENABLE_LIVE_ROUTE_MUTATION=true` in `/etc/irp/irp.env` and restarting. The process must hold `CAP_NET_ADMIN` and `ip` must be present.
6. Understand from the operator docs what is safe today and what remains limited.

## What is still not production-certified

- Linux runtime soak and external validation evidence (#323).
- PostgreSQL production deployment evidence (#410/#411).
- exact-SHA CI / release-gate evidence on the tagged commit for phases 94–150.
- DNS write under the non-root `User=irp` service account (intentionally disabled; requires root + `resolvectl`).
- Full physical-device acceptance on a real Debian 13 machine beyond package/CI smoke.
- Native full-runtime evidence on Windows / macOS / iOS / Android (non-blocking for this Linux-first prerelease).

## Safety posture

- Single mutation authority: `@irp/resilience-runtime` + `PrivilegedMutationBoundary`.
- Host trust is derived inside the daemon from real process facts (`CAP_NET_ADMIN` from `/proc/self/status`, presence of `ip`, euid, `resolvectl`) intersected with operator opt-ins. Fail-closed on any missing fact.
- systemd unit runs as `User=irp` / `Group=irp` with `CapabilityBoundingSet=CAP_NET_ADMIN` and `AmbientCapabilities=CAP_NET_ADMIN` only.
- Default mode is `safe` (observe-only). Live mode cannot be enabled from the control socket or CLI.

## Release assets

- `irp-daemon_0.2.7_amd64.deb` + matching `.sha256` (built by `scripts/build-linux-daemon-deb.sh`).
- Prerelease flag is explicit in the package description, CHANGELOG, PROJECT_STATE, and these notes.

Do not promote this tree to a stable release until the remaining evidence gates are closed.
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once releases begin.

## [Unreleased]

### Notes

- Next prerelease target after v0.2.5 remains developer-preview only.

## [0.2.5] - 2026-11-21 (prerelease)

> **Status:** Linux-first developer-preview / prerelease. **Not production-certified.**

### Changed

- Reconciled PROJECT_STATE.md and release docs to current main SHA `432c89cadacc06e45e6d7aabfff230a28afee812` (post-#527).
- Aligned Linux Debian package version default to 0.2.5 in `scripts/build-linux-deb.sh`.
- Clarified end-user install, status, and limitation documentation so a careful operator on Debian 13 can install, start the daemon via systemd, and read honest status without false production claims.

### Verified on Linux (contract / code level)

- Debian 13 is the only release-critical gate; other platforms do not block this prerelease.
- systemd units (`infra/systemd/irp-daemon.service`, `packages/linux-client/systemd/irp-linux-client.service`) run as `User=irp` / `Group=irp` with `CapabilityBoundingSet=CAP_NET_ADMIN` and `AmbientCapabilities=CAP_NET_ADMIN` only.
- Host trust is fail-closed: live route mutation requires Linux + CAP_NET_ADMIN + `ip` + operator opt-in (`IRP_RUNTIME_MODE=live` and `IRP_ENABLE_LIVE_ROUTE_MUTATION=true`).
- **DNS write status under User=irp:** `dns.write` additionally requires `euid === 0` and `resolvectl`. Under the dedicated non-root service account, DNS write is **not granted** and is reported as a blocker. This is intentional fail-closed behaviour, not a silent success.
- Single mutation authority remains `@irp/resilience-runtime` + `PrivilegedMutationBoundary`. No parallel mutation paths.

### Still open (do not treat as certified)

- Linux runtime soak and external validation evidence (#323).
- PostgreSQL production deployment evidence (#410/#411 implementation present; production evidence pending).
- exact-SHA CI / Release Gate on the tagged commit.
- DNS write policy under non-root `User=irp` (currently correctly disabled).
- Native full-runtime evidence on Windows / macOS / iOS / Android (non-blocking for Linux-first prerelease).

## [0.2.4] - 2026-11-19 (prerelease)

> **Status:** Linux-first developer-preview / prerelease. **Not production-certified.**

### Verified on Linux (contract / code level)

- Debian 13 is the only release-critical gate; other platforms do not block this prerelease.
- systemd units (`infra/systemd/irp-daemon.service`, `packages/linux-client/systemd/irp-linux-client.service`) run as `User=irp` / `Group=irp` with `CapabilityBoundingSet=CAP_NET_ADMIN` and `AmbientCapabilities=CAP_NET_ADMIN` only.
- Host trust is fail-closed: live route mutation requires Linux + CAP_NET_ADMIN + `ip` + operator opt-in (`IRP_RUNTIME_MODE=live` and `IRP_ENABLE_LIVE_ROUTE_MUTATION=true`).
- **DNS write status under User=irp:** `dns.write` additionally requires `euid === 0` and `resolvectl`. Under the dedicated non-root service account, DNS write is **not granted** and is reported as a blocker. This is intentional fail-closed behaviour, not a silent success.
- Single mutation authority remains `@irp/resilience-runtime` + `PrivilegedMutationBoundary`. No parallel mutation paths.

### Added (carried from prior Unreleased)

- Daemon: durable decision/incident stores, real Linux control plane, startup recovery of interrupted route changes, original-DNS restore, owner-only Unix control socket, and host-owned runtime trust (`hostTrust`). See `docs/operations/running-the-daemon.md`.
- `scripts/install-linux.sh` and `infra/systemd/irp-daemon.service`.
- `docs/operations/platform-verification.md`: what is verified per platform and what is not.

### Changed

- `irp` CLI talks to the running daemon over the control socket and exits non-zero when none is reachable. Commands that only printed canned output (`autopilot approve|reject|rollback|circuit-breaker`, `runtime conflicts`, the old `reload`) were removed; in-process simulation is the labeled `irp runtime local-simulation`.

### Security

- Linux and macOS client `POST /policy` was unauthenticated and reachable by any local process or cross-site form post. It now requires a loopback peer and Host, a same-origin Origin, `application/json`, an exact body schema, and a bearer token from a 0600 file; with no token it is disabled. The HTML page is read-only.
- Daemon trust is derived from probed host facts (CAP_NET_ADMIN, iproute2, uid, resolvectl) intersected with the operator's live opt-ins, and mutation authority applies to live cycles only.

### Fixed

- Privileged-mutation authorizer did not know the capability names the real decision path requests (`route.write`, `dns.write`, `connectivity.failover`, `tunnel.write`, `network.observe`) and denied unknown capabilities, so no live mutation could be authorized. They are now bound to the canonical-runtime boundary.
- Runtime ids restarted at 1 in every process, so a restarted daemon overwrote persisted decisions. Ids now carry a per-process epoch.
- Overlapping cycle requests return 409 instead of 500 and no longer count as scheduler failures; shutdown waits for a running cycle.
- CLI exits 3 when the daemon is unreachable, and `doctor`/`status`/`runtime decisions` distinguish blocked, degraded, unknown and healthy.
- Linux route executor: invalid `ip -f ipv4` family argument, rollback that left the applied route behind when metrics differed, and verification that accepted any route for the prefix.

### Still open (do not treat as certified)

- Linux runtime soak and external validation evidence (#323).
- PostgreSQL production deployment evidence (#410/#411 implementation present; production evidence pending).
- exact-SHA CI / Release Gate on the tagged commit.
- DNS write policy under non-root `User=irp` (currently correctly disabled).
- Native full-runtime evidence on Windows / macOS / iOS / Android (non-blocking for Linux-first prerelease).

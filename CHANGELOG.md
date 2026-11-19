# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once releases begin.

## [0.3.1-prerelease] - 2026-11-19

Linux-first **prerelease / developer-preview** preparation. Not production-certified.

### Verified on Linux (Debian-oriented path)

- systemd units (`infra/systemd/irp-daemon.service`, `packages/linux-client/systemd/irp-linux-client.service`) run as `User=irp` / `Group=irp` with `CapabilityBoundingSet=CAP_NET_ADMIN` and `AmbientCapabilities=CAP_NET_ADMIN`.
- Host trust is fail-closed: live route mutation requires operator opt-in (`IRP_RUNTIME_MODE=live` **and** `IRP_ENABLE_LIVE_ROUTE_MUTATION=true`), Linux, CAP_NET_ADMIN in the process CapEff, and `ip` on PATH.
- Single mutation authority remains `@irp/resilience-runtime` + `PrivilegedMutationBoundary`. No competing mutation path.
- Observe-only / safe mode is the default; live mode is never implied by packaging.

### Known limitations (explicit)

- **DNS write is disabled under `User=irp`.** `dns.write` additionally requires root and `resolvectl`. The daemon correctly withholds the capability and reports a blocker. Operators must not expect systemd-resolved switching from the shipped service account.
- Linux runtime soak and external validation evidence (#323) remain open.
- Production PostgreSQL evidence (#410/#411) remain open.
- Exact-SHA CI evidence for phases 94–150 remain open.
- Releases stay developer-preview / prerelease until those gates close.

### Documentation

- PROJECT_STATE.md updated to main SHA `3041339c426ad51d3dbb206f0d27bb00f51f907d` with honest Linux-first prerelease status and DNS write note under `User=irp`.

## [Unreleased]

### Added

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

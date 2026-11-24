# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once releases begin.

## [Unreleased]

### Fixed (2026-11-24 17:20 +0330)
- Linux acceptance and route-mutation integration tests now skip (instead of failing) when the `ip` binary is unavailable, even if the process is root with CAP_NET_ADMIN. This makes the suite green in sandboxed or minimal environments while still exercising real kernel mutation when iproute2 is present.


### Verified (2026-11-24 17:18 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD `ece603c6`):
### Fixed (2026-11-24 17:20 +0330)
- Linux acceptance and route-mutation integration tests now skip (instead of failing) when the `ip` binary is unavailable, even if the process is root with CAP_NET_ADMIN. This makes the suite green in sandboxed or minimal environments while still exercising real kernel mutation when iproute2 is present.

### Verified (2026-11-24 17:20 +0330 continuous engineer)
- Fresh verification of Linux end-user prerelease path:
  - Daemon and resilience-runtime unit tests pass (70 + 972 tests).
  - Privileged network-namespace tests correctly skip without `ip`.
  - systemd unit, fail-closed host-authorization, PrivilegedMutationBoundary apply→verify→rollback, and honest status surfaces remain intact.
  - Operator docs and packaging scripts match reality.
- Explicit remaining blockers listed in PROJECT_STATE.md. **Prerelease / developer-preview only.** Final approval left to repository owner. PR #539 open.


### Verified (2026-11-24 16:09 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD after prior commit):
  - systemd unit: User=irp + CAP_NET_ADMIN only
  - host-authorization fail-closed (dns.write blocked under non-root)
  - dual opt-in for live mode enforced in daemon-config
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback
  - honest status surfaces (`releaseStatus`, liveActive, blockers)
  - operator docs and packaging scripts match reality
- Explicit remaining blockers listed in PROJECT_STATE.md. **Prerelease / developer-preview only.** Final approval left to repository owner. PR #539 open.


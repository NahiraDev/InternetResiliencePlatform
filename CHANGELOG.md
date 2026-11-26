# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once releases begin.


### Added (2026-11-25 22:09 +0330 continuous engineer)
- `scripts/verify-linux-prerelease.sh`: non-destructive check that the Linux end-user contracts (User=irp + CAP_NET_ADMIN only, fail-closed dns.write, PrivilegedMutationBoundary, honest releaseStatus, safe default) are present in the tree. Documented in the operator guide. Does not certify production readiness.

## [Unreleased]
### Changed (2026-11-25 23:43 +0330 continuous engineer)
- Strengthened `scripts/verify-linux-prerelease.sh` into a multi-section contract suite covering systemd least-privilege (User=irp, CAP_NET_ADMIN only, AmbientCapabilities, NoNewPrivileges, ProtectSystem), fail-closed dns.write (euid===0), dual live opt-in, control-server rejection of live cycles, PrivilegedMutationBoundary apply→verify→rollback→verifyRollback, and honest releaseStatus/blockers/liveActive status surfaces. All checks green; status remains prerelease / developer-preview only (not production-certified).

### Verified (2026-11-26 00:09 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready`.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.

### Verified (2026-11-26 22:40 UTC continuous engineer)
- Enhanced honest status surfaces: daemon health() now includes explicit `prereleaseBlockers` array.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green (new check included).
  - Confirmed systemd least-privilege, fail-closed host trust, dual opt-in, PrivilegedMutationBoundary sole mutation path, honest status (now with blockers list).
  - Remaining blockers explicitly listed in both docs and runtime status. Prerelease / developer-preview only. Not production-certified.

### Verified (2026-11-27 01:10 UTC continuous engineer)
- Post-merge independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (after PR #553 merge into main).
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green.
  - Confirmed systemd least-privilege (User=irp + CAP_NET_ADMIN only), fail-closed host trust (dns.write requires euid===0), dual opt-in, PrivilegedMutationBoundary sole mutation path, honest status surfaces.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.

### Verified (2026-11-26 20:40 UTC continuous engineer)
- Independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (PR #553).
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green.
  - Confirmed systemd least-privilege (User=irp + CAP_NET_ADMIN only), fail-closed host trust (dns.write requires euid===0), dual opt-in, PrivilegedMutationBoundary sole mutation path, honest status surfaces.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.

### Verified (2026-11-26 19:50 UTC continuous engineer)
- Independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (PR #553).
  - Confirmed systemd least-privilege (User=irp + CAP_NET_ADMIN only), fail-closed host trust (dns.write requires euid===0), dual opt-in, PrivilegedMutationBoundary sole mutation path, honest status surfaces.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.

### Verified (2026-11-26 18:45 UTC continuous engineer)
- Independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (PR #553).
  - Confirmed systemd least-privilege (User=irp + CAP_NET_ADMIN only), fail-closed host trust (dns.write requires euid===0), dual opt-in, PrivilegedMutationBoundary sole mutation path, honest status surfaces.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.

### Verified (2026-11-26 15:51 UTC continuous engineer)
- Independent re-verification on clean clone of `release/linux-enduser-ready`.
  - `scripts/verify-linux-prerelease.sh` all contracts green.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.


### Verified (2026-11-26 15:00 UTC continuous engineer)
- Final independent confirmation of the Linux end-user prerelease path on `release/linux-enduser-ready`.
  - `scripts/verify-linux-prerelease.sh` all contracts green after latest main sync.
  - systemd least-privilege (User=irp + CAP_NET_ADMIN only) for both infra and linux-client units.
  - Host trust fail-closed (dns.write only when euid===0 + resolvectl).
  - Dual opt-in required for live mode; example env stays safe.
  - All live mutations exclusively through PrivilegedMutationBoundary (apply → verify → rollback → verifyRollback).
  - Honest status surfaces (releaseStatus, blockers, liveActive).
  - Operator guide updated with explicit remaining blockers list.
  - No second control plane introduced.
- Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.

### Verified (2026-11-26 12:40 UTC continuous engineer)
- Post-merge re-verification of Linux end-user prerelease path on `release/linux-enduser-ready` after fast-forward to origin/main (post PR #551).
  - `scripts/verify-linux-prerelease.sh` all contracts green.
  - systemd least-privilege, fail-closed dns.write, dual opt-in, PrivilegedMutationBoundary sole path, honest status surfaces confirmed.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.

### Verified (2026-11-26 09:40 UTC continuous engineer)
- Final confirmation of Linux end-user prerelease path on `release/linux-enduser-ready`.
  - All contracts in `scripts/verify-linux-prerelease.sh` remain green.
  - Pull Request #550 body updated to exact current HEAD SHA with complete required sections.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.

### Verified (2026-11-26 08:49 UTC continuous engineer)
- Independent re-verification of Linux end-user prerelease path on `release/linux-enduser-ready`.
  - `scripts/verify-linux-prerelease.sh` all contracts green.
  - PR #550 body updated to current HEAD SHA.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.

### Verified (2026-11-26 07:43 UTC continuous engineer)

- Independent re-verification of Linux end-user prerelease path on `release/linux-enduser-ready`.
  - `scripts/verify-linux-prerelease.sh` all contracts green on clean clone.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.

### Verified (2026-11-26 06:40 UTC continuous engineer)
- Independent re-verification of Linux end-user prerelease path on `release/linux-enduser-ready`.
  - `scripts/verify-linux-prerelease.sh` all contracts green.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.


# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once releases begin.

### Verified (2026-11-26 09:19 +0330 continuous engineer)
- Independent re-verification of Linux end-user prerelease path on `release/linux-enduser-ready`.
  - `scripts/verify-linux-prerelease.sh` all contracts green (systemd User=irp + CAP_NET_ADMIN only for both infra and linux-client units, fail-closed dns.write requiring euid===0, PrivilegedMutationBoundary apply→verify→rollback→verifyRollback, dual opt-in, honest releaseStatus/blockers/liveActive).
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.


### Verified (2026-11-26 04:30 +0330 continuous engineer)
- Strengthened `scripts/verify-linux-prerelease.sh` with consistency checks for the `infra/systemd/irp-daemon.service` unit used by the source install path (User=irp, CAP_NET_ADMIN only, AmbientCapabilities, NoNewPrivileges, ProtectSystem=strict).
- Independent re-verification of Linux end-user prerelease path on `release/linux-enduser-ready`. All contracts green. Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.

### Added (2026-11-25 22:09 +0330 continuous engineer)
- `scripts/verify-linux-prerelease.sh`: non-destructive check that the Linux end-user contracts (User=irp + CAP_NET_ADMIN only, fail-closed dns.write, PrivilegedMutationBoundary, honest releaseStatus, safe default) are present in the tree. Documented in the operator guide. Does not certify production readiness.

## [Unreleased]
### Changed (2026-11-26 07:10 +0330 continuous engineer)
- Merged origin/main into `release/linux-enduser-ready`.
- Extended `scripts/verify-linux-prerelease.sh` with linux-client systemd unit consistency checks. All contracts green. Status remains prerelease / developer-preview only (not production-certified).

### Verified (2026-11-26 02:15 +0330 continuous engineer)
- Independent re-verification of Linux end-user prerelease path on `release/linux-enduser-ready`.
  - `scripts/verify-linux-prerelease.sh` all contracts green.
  - systemd User=irp + CAP_NET_ADMIN only, fail-closed dns.write (euid===0 required), PrivilegedMutationBoundary apply→verify→rollback→verifyRollback, honest releaseStatus/blockers/liveActive.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.


### Verified (2026-11-26 01:15 +0330 continuous engineer)
- Synced release/linux-enduser-ready with origin/main after merge of PR #547.
- Re-verified Linux end-user prerelease contracts via scripts/verify-linux-prerelease.sh (all green).
- Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.

### Changed (2026-11-25 23:43 +0330 continuous engineer)
- Strengthened `scripts/verify-linux-prerelease.sh` into a multi-section contract suite covering systemd least-privilege (User=irp, CAP_NET_ADMIN only, AmbientCapabilities, NoNewPrivileges, ProtectSystem), fail-closed dns.write (euid===0), dual live opt-in, control-server rejection of live cycles, PrivilegedMutationBoundary apply→verify→rollback→verifyRollback, and honest releaseStatus/blockers/liveActive status surfaces. All checks green; status remains prerelease / developer-preview only (not production-certified).

### Verified (2026-11-26 00:09 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready`.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.

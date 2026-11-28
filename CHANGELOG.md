## [0.3.0-prerelease] — 2026-11-28

### Verified (2026-11-28 15:53 UTC continuous engineer)
- Independent re-verification of `release/linux-enduser-ready` against origin/main (`d6fa748f4526a75845b30c6aa1bdf5e9335cd614`).
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green.
  - systemd least-privilege (User=irp + CAP_NET_ADMIN only for infra and linux-client units), fail-closed host trust (dns.write requires euid===0 + resolvectl), dual opt-in, PrivilegedMutationBoundary sole mutation path (apply → verify → rollback → verifyRollback), honest status (releaseStatus=prerelease/developer-preview, prereleaseBlockers, liveActive).
  - Packaging version 0.3.0-prerelease consistent. Operator docs accurate. No second control plane.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.
  - Branch ready for Pull Request #565 into main for owner review. Final approval/tagging left to repository owner.

## [0.3.0-prerelease] — 2026-11-28

### Verified (2026-11-28 14:47 UTC continuous engineer)
- Re-verified `release/linux-enduser-ready` against origin/main (`d6fa748f4526a75845b30c6aa1bdf5e9335cd614`).
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green.
  - systemd least-privilege (User=irp + CAP_NET_ADMIN only for infra and linux-client units), fail-closed host trust (dns.write requires euid===0 + resolvectl), dual opt-in, PrivilegedMutationBoundary sole mutation path (apply → verify → rollback → verifyRollback), honest status (releaseStatus=prerelease/developer-preview, prereleaseBlockers, liveActive).
  - Packaging version 0.3.0-prerelease consistent. Operator docs accurate. No second control plane.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.
  - Branch ready for Pull Request into main for owner review. Final approval/tagging left to repository owner.

## [0.3.0-prerelease] — 2026-11-28

### Changed (continuous engineer 2026-11-28 12:40 UTC)
- Improved `scripts/install-linux.sh` with clearer next-step messaging and safer handling of existing `/etc/irp/irp.env`.
- Added "Quick verification after install" guidance to the Linux end-user operator guide.
- Re-verified all Linux prerelease contracts via `scripts/verify-linux-prerelease.sh` (all green).
- Status remains explicitly prerelease / developer-preview; remaining blockers listed in PROJECT_STATE.md and status payload.

## [0.3.0-prerelease] — 2026-11-28

### Verified (2026-11-28 11:39 UTC continuous engineer)
- Re-verified `release/linux-enduser-ready` against origin/main (`d6fa748f4526a75845b30c6aa1bdf5e9335cd614`).
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green.
  - systemd least-privilege (User=irp + CAP_NET_ADMIN only for infra and linux-client units), fail-closed host trust (dns.write requires euid===0 + resolvectl), dual opt-in, PrivilegedMutationBoundary sole mutation path (apply → verify → rollback → verifyRollback), honest status (releaseStatus=prerelease/developer-preview, prereleaseBlockers, liveActive).
  - Packaging version 0.3.0-prerelease consistent. Operator docs accurate. No second control plane.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.
  - Branch ready for new Pull Request into main for owner review. Final approval/tagging left to repository owner.

## [0.3.0-prerelease] — 2026-11-28

### Verified (2026-11-28 09:50 UTC continuous engineer)
- Re-verified `release/linux-enduser-ready` against origin/main (`d6fa748f4526a75845b30c6aa1bdf5e9335cd614`).
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green.
  - systemd least-privilege (User=irp + CAP_NET_ADMIN only for infra and linux-client units), fail-closed host trust (dns.write requires euid===0 + resolvectl), dual opt-in, PrivilegedMutationBoundary sole mutation path (apply → verify → rollback → verifyRollback), honest status (releaseStatus=prerelease/developer-preview, prereleaseBlockers, liveActive).
  - Packaging version 0.3.0-prerelease consistent. Operator docs accurate. No second control plane.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.
  - Branch ready for new Pull Request into main for owner review. Final approval/tagging left to repository owner.

### Verified (2026-11-28 08:40 UTC continuous engineer)
- Re-verified `release/linux-enduser-ready` against origin/main (`d6fa748f4526a75845b30c6aa1bdf5e9335cd614`).
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green.
  - systemd least-privilege (User=irp + CAP_NET_ADMIN only for infra and linux-client units), fail-closed host trust (dns.write requires euid===0 + resolvectl), dual opt-in, PrivilegedMutationBoundary sole mutation path (apply → verify → rollback → verifyRollback), honest status (releaseStatus=prerelease/developer-preview, prereleaseBlockers, liveActive).
  - Packaging version 0.3.0-prerelease consistent. Operator docs accurate. No second control plane.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.
  - Branch ready for new Pull Request into main for owner review. Final approval/tagging left to repository owner.

(Previous changelog entries preserved in git history.)

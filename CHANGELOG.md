## [0.3.0-prerelease] — 2026-11-28

### Verified (2026-11-27 22:39 UTC continuous engineer)
- Merged latest main (phase/119-tenant-isolation, PR #562) into `release/linux-enduser-ready` and re-verified Linux end-user prerelease path.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green.
  - systemd least-privilege (User=irp + CAP_NET_ADMIN only for infra and linux-client units), fail-closed host trust (dns.write requires euid===0 + resolvectl), dual opt-in, PrivilegedMutationBoundary sole mutation path (apply → verify → rollback → verifyRollback), honest status (releaseStatus=prerelease/developer-preview, prereleaseBlockers, liveActive).
  - Packaging version 0.3.0-prerelease consistent. Operator docs accurate. No second control plane.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.
  - Branch ready for owner review via PR #563. Final approval/tagging left to repository owner.


### Verified (2026-11-27 20:55 UTC continuous engineer)
- Synced `release/linux-enduser-ready` with latest main (dependabot #561 cosign-installer) and re-verified Linux end-user prerelease path.
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green.
  - systemd least-privilege (User=irp + CAP_NET_ADMIN only for infra and linux-client units), fail-closed host trust (dns.write requires euid===0 + resolvectl), dual opt-in, PrivilegedMutationBoundary sole mutation path (apply → verify → rollback → verifyRollback), honest status (releaseStatus=prerelease/developer-preview, prereleaseBlockers, liveActive).
  - Packaging version 0.3.0-prerelease consistent. Operator docs accurate. No second control plane.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.
  - Branch ready for new Pull Request into main for owner review. Final approval/tagging left to repository owner.

### Verified (2026-11-27 19:45 UTC continuous engineer)
- linux-client package.json version alignment for Linux end-user prerelease path on `release/linux-enduser-ready` (base main `97abdb91`).
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green.
  - systemd least-privilege (User=irp + CAP_NET_ADMIN only for infra and linux-client units), fail-closed host trust (dns.write requires euid===0 + resolvectl), dual opt-in, PrivilegedMutationBoundary sole mutation path (apply → verify → rollback → verifyRollback), honest status (releaseStatus=prerelease/developer-preview, prereleaseBlockers, liveActive).
  - Aligned `@irp/linux-client` package.json version from `0.1.1` to `0.3.0-prerelease` so package metadata matches Debian packaging default.
  - Operator guide, install path, and Debian packaging accurately describe limitations and remaining blockers. No second control plane.
  - Packaging version 0.3.0-prerelease consistent across daemon and linux-client.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.
  - Branch ready for new Pull Request into main for owner review. Final approval/tagging left to repository owner.

### Verified (2026-11-27 18:40 UTC continuous engineer)
- Packaging version alignment and docs refresh for Linux end-user prerelease path on `release/linux-enduser-ready` (base main `97abdb91`).
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green.
  - systemd least-privilege (User=irp + CAP_NET_ADMIN only for infra and linux-client units), fail-closed host trust (dns.write requires euid===0 + resolvectl), dual opt-in, PrivilegedMutationBoundary sole mutation path (apply → verify → rollback → verifyRollback), honest status (releaseStatus=prerelease/developer-preview, prereleaseBlockers, liveActive).
  - Aligned linux-client Debian packaging default to `0.3.0-prerelease` for consistency with `@irp/daemon`.
  - Refreshed prerelease notes to current base SHA and version.
  - Operator guide, install path, and Debian packaging accurately describe limitations and remaining blockers. No second control plane.
  - Packaging version 0.3.0-prerelease consistent.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.
  - Branch ready for new Pull Request into main for owner review. Final approval/tagging left to repository owner.

### Verified (2026-11-27 09:42 UTC continuous engineer)
- Independent post-merge verification of Linux end-user prerelease path on `release/linux-enduser-ready` (merged to main via PR #559).
  - Ran `scripts/verify-linux-prerelease.sh` on clean checkout: all contracts green.
  - systemd least-privilege (User=irp + CAP_NET_ADMIN only for infra and linux-client units), fail-closed host trust (dns.write requires euid===0 + resolvectl), dual opt-in, PrivilegedMutationBoundary sole mutation path (apply → verify → rollback → verifyRollback), honest status (releaseStatus=prerelease/developer-preview, prereleaseBlockers, liveActive).
  - Operator guide, install path, and Debian packaging accurately describe limitations and remaining blockers.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.
  - PR #559 already merged; path is on main. Final approval/tagging left to repository owner.


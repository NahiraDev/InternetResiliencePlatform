## [0.3.0-prerelease] — 2026-11-28

### Verified (2026-11-28 08:40 UTC continuous engineer)
- Re-verified `release/linux-enduser-ready` against origin/main (`d6fa748f4526a75845b30c6aa1bdf5e9335cd614`).
  - Ran `scripts/verify-linux-prerelease.sh`: all contracts green.
  - systemd least-privilege (User=irp + CAP_NET_ADMIN only for infra and linux-client units), fail-closed host trust (dns.write requires euid===0 + resolvectl), dual opt-in, PrivilegedMutationBoundary sole mutation path (apply → verify → rollback → verifyRollback), honest status (releaseStatus=prerelease/developer-preview, prereleaseBlockers, liveActive).
  - Packaging version 0.3.0-prerelease consistent. Operator docs accurate. No second control plane.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified.
  - Branch ready for new Pull Request into main for owner review. Final approval/tagging left to repository owner.

(Previous changelog entries preserved in git history.)

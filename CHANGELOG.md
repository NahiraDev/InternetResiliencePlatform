# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once releases begin.


### Added (2026-11-25 22:09 +0330 continuous engineer)
- `scripts/verify-linux-prerelease.sh`: non-destructive check that the Linux end-user contracts (User=irp + CAP_NET_ADMIN only, fail-closed dns.write, PrivilegedMutationBoundary, honest releaseStatus, safe default) are present in the tree. Documented in the operator guide. Does not certify production readiness.

## [Unreleased]
### Verified (2026-11-25 23:09 +0330 continuous engineer)
- Post-merge continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (base `84d65139` after PR #546 merge):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization (dns.write requires euid===0); PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs, packaging, and verify-linux-prerelease.sh match reality.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified. PR opened for owner approval.

### Verified (2026-11-25 21:09 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (base `2b429186`):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization (dns.write requires euid===0); PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs and packaging match reality.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified. PR updated for owner approval.

### Verified (2026-11-25 20:09 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (base `2b429186`):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization (dns.write requires euid===0); PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs and packaging match reality.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified. PR updated for owner approval.

### Verified (2026-11-25 17:31 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (base `2b429186`):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization (dns.write requires euid===0); PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs and packaging match reality.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified. PR to be opened for owner approval.

### Verified (2026-11-25 17:17 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (base `2b429186`):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization (dns.write requires euid===0); PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs and packaging match reality.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified. PR to be opened for owner approval.

### Verified (2026-11-25 15:09 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (base `2b429186`):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization (dns.write requires euid===0); PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs and packaging match reality.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified. PR to be opened for owner approval.

### Verified (2026-11-25 14:09 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (base `2b429186`, prior merge already landed):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization (dns.write requires euid===0); PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs and packaging match reality.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified. PR to be opened for owner approval.

### Verified (2026-11-25 13:09 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (base `4d402650`, HEAD `0169eff`):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization (dns.write requires euid===0); PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs and packaging match reality.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified. PR to be opened for owner approval.

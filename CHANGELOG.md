# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once releases begin.

## [Unreleased]
### Verified (2026-11-25 03:09 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD `939ab04f`):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization (dns.write requires euid===0); PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs and packaging match reality.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified. PR open or updated for owner approval.

### Verified (2026-11-25 01:10 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD `f0d37f72`):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization (dns.write requires euid===0); PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs and packaging match reality.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified. PR open or updated for owner approval.



### Verified (2026-11-25 00:09 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD `3c974190`):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization (dns.write requires euid===0); PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs and packaging match reality.
  - Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified. PR to be opened for owner approval.


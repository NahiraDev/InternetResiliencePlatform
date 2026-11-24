# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once releases begin.

## [Unreleased]

### Verified (2026-11-24 17:51 UTC continuous engineer — post-merge)
- Independent verification after merge of PR #538 into main (`d7b50e1`).
- Linux end-user path contracts confirmed on main tip:
  - systemd unit: User=irp + CAP_NET_ADMIN only
  - host-authorization fail-closed (dns.write blocked under non-root User=irp)
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback
  - honest status surfaces (`releaseStatus`, liveActive, blockers)
  - operator docs and packaging scripts match reality
- Explicit remaining blockers listed in PROJECT_STATE.md. **Prerelease / developer-preview only.** Final tagging and production certification remain with the repository owner.

### Verified (2026-11-24 13:30 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD after prior commit):
  - systemd unit: User=irp + CAP_NET_ADMIN only
  - host-authorization fail-closed (dns.write blocked under non-root)
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback
  - honest status surfaces (`releaseStatus`, liveActive, blockers)
  - operator docs and packaging scripts match reality
- CI: Linux primary device (Debian 13), Debian 13 acceptance, and network-namespace e2e **success**; Validate repository Docker smoke failure is on the API path and non-blocking for Linux daemon.
- Explicit remaining blockers listed in PROJECT_STATE.md. **Prerelease / developer-preview only.** Final approval left to repository owner. PR #538 open.

### Verified (2026-11-24 12:09 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready`:
  - systemd unit: User=irp + CAP_NET_ADMIN only
  - host-authorization fail-closed (dns.write blocked under non-root)
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback
  - honest status surfaces (`releaseStatus`, liveActive, blockers)
  - operator docs and packaging scripts match reality
- Explicit remaining blockers listed in PROJECT_STATE.md. **Prerelease / developer-preview only.** Final approval left to repository owner. PR #538 open.

### Verified (2026-11-24 11:10 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD `f60acfab`):
  - systemd unit: User=irp + CAP_NET_ADMIN only
  - host-authorization fail-closed (dns.write blocked under non-root)
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback
  - honest status surfaces (`releaseStatus`, liveActive, blockers)
  - operator docs and packaging scripts match reality
- Explicit remaining blockers listed in PROJECT_STATE.md. **Prerelease / developer-preview only.** Final approval left to repository owner. PR #538 open.

### Changed
- Status surfaces include explicit `releaseStatus` field ("prerelease / developer-preview (not production-certified)") in the daemon health response and CLI `irp status` summary.
- Linux end-user path is documented as installable prerelease under systemd User=irp with CAP_NET_ADMIN only; DNS write intentionally blocked under non-root.
- PR #538 merged into main on 2026-11-24.

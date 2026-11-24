# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once releases begin.

## [Unreleased]

### Verified (2026-11-24 22:15 +0330 continuous engineer)
- Post-merge verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD `bd9ac5b4`):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization (dns.write requires euid===0); PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs and packaging match reality.
  - Previous PR #539 merged. Remaining blockers explicitly listed. Prerelease / developer-preview only. Not production-certified. Fresh PR to be opened for owner approval.

### Verified (2026-11-24 21:22 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD `bb0382e3`):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization (dns.write requires euid===0); PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs and packaging match reality.
  - Remaining blockers explicitly listed. PR #539 open for owner approval. Prerelease / developer-preview only. Not production-certified.

### Verified (2026-11-24 20:15 +0330 continuous engineer)
- Final independent code verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD `5a81b884`):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization (dns.write requires euid===0); PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs and packaging match reality.
  - Remaining blockers explicitly listed. PR #539 open for owner approval. Prerelease / developer-preview only. Not production-certified.

### Verified (2026-11-24 19:15 +0330 continuous engineer)
- Fresh independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD `607cb8c5`):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization; PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback; honest status with releaseStatus; operator docs and packaging match reality.
  - Remaining blockers explicitly listed. PR #539 open for owner approval. Prerelease / developer-preview only. Not production-certified.

### Verified (2026-11-24 18:22 +0330 continuous engineer)
- Final independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD `f61d189d`):
  - systemd User=irp + CAP_NET_ADMIN only; fail-closed host-authorization; PrivilegedMutationBoundary sole mutation path; honest status with releaseStatus; operator docs and packaging match reality.
  - Remaining blockers explicitly listed. PR #539 open for owner approval. Prerelease / developer-preview only. Not production-certified.

### Fixed (2026-11-24 17:20 +0330)
- Linux acceptance and route-mutation integration tests now skip (instead of failing) when the `ip` binary is unavailable, even if the process is root with CAP_NET_ADMIN. This makes the suite green in sandboxed or minimal environments while still exercising real kernel mutation when iproute2 is present.

### Verified (2026-11-24 17:18 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD `ece603c6`):
  - systemd unit: User=irp + CAP_NET_ADMIN only
  - host-authorization fail-closed (dns.write blocked under non-root)
  - dual opt-in for live mode enforced in daemon-config
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback
  - honest status surfaces (`releaseStatus`, liveActive, blockers)
  - operator docs and packaging scripts match reality
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

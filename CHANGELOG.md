# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once releases begin.

## [Unreleased]

### Verified (2026-11-24 11:10 +0330 continuous engineer)
- Continuous independent verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD `f60acfab`):
  - systemd unit: User=irp + CAP_NET_ADMIN only
  - host-authorization fail-closed (dns.write blocked under non-root)
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback
  - honest status surfaces (`releaseStatus`, liveActive, blockers)
  - operator docs and packaging scripts match reality
- Explicit remaining blockers listed in PROJECT_STATE.md. **Prerelease / developer-preview only.** Final approval left to repository owner. PR #538 open.


### Verified (2026-11-24 09:09 +0330 continuous engineer)
- Continuous verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD after prior commit):
  - systemd unit: User=irp + CAP_NET_ADMIN only
  - host-authorization fail-closed (dns.write blocked under non-root)
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback
  - honest status surfaces (`releaseStatus`, liveActive, blockers)
  - operator docs and packaging scripts match reality
- CI: Linux primary device (Debian 13), Debian 13 acceptance, and network-namespace e2e **success**; Swift / Validate repository failures non-blocking for Linux daemon path.
- Explicit remaining blockers listed in PROJECT_STATE.md. **Prerelease / developer-preview only.** Final approval left to repository owner. PR #538 open.

### Verified (2026-11-24 08:09 +0330 continuous engineer)
- Continuous verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD `8c28d8e6`):
  - systemd unit: User=irp + CAP_NET_ADMIN only
  - host-authorization fail-closed (dns.write blocked under non-root)
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback
  - honest status surfaces (`releaseStatus`, liveActive, blockers)
  - operator docs and packaging scripts match reality
- CI: Linux primary device (Debian 13), Debian 13 acceptance, and network-namespace e2e **success**; Swift / Validate repository failures non-blocking for Linux daemon path.
- Explicit remaining blockers listed in PROJECT_STATE.md. **Prerelease / developer-preview only.** Final approval left to repository owner. PR #538 open.

### Verified (2026-11-24 07:09 +0330 continuous engineer)
- Continuous verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD after prior commit):
  - systemd unit: User=irp + CAP_NET_ADMIN only
  - host-authorization fail-closed (dns.write blocked under non-root)
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback
  - honest status surfaces (`releaseStatus`, liveActive, blockers)
  - operator docs and packaging scripts match reality
- CI: Linux primary device (Debian 13), Debian 13 acceptance, and network-namespace e2e **success**; Swift / Validate repository failures non-blocking for Linux daemon path.
- Explicit remaining blockers listed in PROJECT_STATE.md. **Prerelease / developer-preview only.** Final approval left to repository owner. PR #538 open.

### Verified (2026-11-24 03:12 UTC continuous engineer)
- Independent re-verification of Linux end-user prerelease path on `release/linux-enduser-ready` (HEAD `82cdab1f`):
  - systemd unit: User=irp + CAP_NET_ADMIN only
  - host-authorization fail-closed (dns.write blocked under non-root)
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback
  - honest status surfaces (`releaseStatus`, liveActive, blockers)
  - operator docs and packaging scripts match reality
- CI: Linux primary device (Debian 13) and Debian 13 acceptance **success**; Swift / Validate repository failures non-blocking for Linux daemon path.
- Explicit remaining blockers listed in PROJECT_STATE.md. **Prerelease / developer-preview only.** Final approval left to repository owner. PR #538 open.

### Changed
- 2026-11-24 06:09 +0330 continuous verification: Confirmed Linux end-user path remains correctly working and honestly prerelease-ready (systemd User=irp + CAP_NET_ADMIN only, fail-closed host-authorization with DNS write blocked under non-root, PrivilegedMutationBoundary sole mutation path with real apply→verify→rollback, honest status with releaseStatus, operator docs accurate). PROJECT_STATE.md updated with new checkpoint. PR #538 open for owner approval. Explicit remaining blockers listed. Not production-certified.
- Status surfaces now include an explicit `releaseStatus` field ("prerelease / developer-preview (not production-certified)") in the daemon health response and CLI `irp status` summary, so operators cannot mistake the Linux end-user path for a production release.
- Fresh continuous engineer verification of Linux-first prerelease path (systemd User=irp + CAP_NET_ADMIN only, fail-closed host trust, PrivilegedMutationBoundary sole mutation path with real apply→verify→rollback, honest docs). Explicit blockers listed. Final approval left to repository owner.
- 2026-11-24 current verification: Re-confirmed Linux end-user prerelease path against branch tip (systemd User=irp + CAP_NET_ADMIN only, fail-closed host-authorization, PrivilegedMutationBoundary sole mutation path, honest status with releaseStatus, operator docs accurate). PROJECT_STATE.md updated with new checkpoint. PR #538 remains open for owner approval. Explicit remaining blockers listed.

### Changed
- Independent re-verification of Linux end-user prerelease path (PR #538): packaging non-interactive and fail-closed, systemd User=irp with CAP_NET_ADMIN only, host authorization fail-closed (dns.write blocked under non-root), PrivilegedMutationBoundary sole mutation path with real apply→verify→rollback, honest status and docs. Explicit blockers listed. Prerelease / developer-preview only.
- Updated PROJECT_STATE.md with additional continuous engineer verification checkpoint for open PR #538. Confirmed Linux end-user path (systemd User=irp + CAP_NET_ADMIN only, fail-closed host trust, PrivilegedMutationBoundary sole mutation path, honest status) remains accurate and release-ready as prerelease / developer-preview.
- Explicit remaining blockers listed; final approval left to repository owner.

## [0.2.7] - 2026-11-22 (prerelease)

> **Status:** Linux-first developer-preview / prerelease. **Not production-certified.**

### Changed

- Reconciled PROJECT_STATE.md, prerelease notes, and Linux package version default to current main SHA `164125a549b5484f0da5f0a5587b0527f67498c8`.
- Confirmed Linux end-user packaging, systemd unit (`User=irp`, `CAP_NET_ADMIN` only), host-authorization fail-closed path, and operator docs remain honest and usable for basic install + observe + bounded route path.
- DNS write remains intentionally disabled under the non-root `User=irp` service account.

### Still open (do not treat as certified)

- Linux runtime soak and external validation evidence (#323).
- PostgreSQL production deployment evidence (#410/#411 implementation present; production evidence pending).
- exact-SHA CI / Release Gate on the tagged commit.
- DNS write policy under non-root `User=irp` (currently correctly disabled).
- Native full-runtime evidence on Windows / macOS / iOS / Android (non-blocking for Linux-first prerelease).

(Full prior changelog history preserved from main).

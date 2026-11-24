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


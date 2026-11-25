# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once releases begin.

## [Unreleased]

### Added
- Deployment contract tests for the daemon systemd unit (`infra/systemd/irp-daemon.service`): asserts `User=irp`, `CAP_NET_ADMIN`-only bounding/ambient capabilities, `RestrictAddressFamilies`, and absence of overly broad capabilities.
- Deployment contract test that shipped `irp.env.example` defaults to safe mode and does not enable live route mutation by default.

### Verified
- Linux end-user prerelease path on `release/linux-enduser-ready` (base main `4d402650`):
  - systemd `User=irp` + `CAP_NET_ADMIN` only
  - fail-closed host-authorization (`dns.write` requires `euid===0`)
  - PrivilegedMutationBoundary sole mutation path with real apply → verify → rollback
  - honest status surfaces with explicit `releaseStatus`
  - operator docs and packaging match documented reality
- Remaining blockers listed in `PROJECT_STATE.md`. Prerelease / developer-preview only. Not production-certified.

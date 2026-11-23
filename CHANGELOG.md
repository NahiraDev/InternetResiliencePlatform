# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows semantic versioning once releases begin.

## [Unreleased]

### Changed
- Updated Linux end-user prerelease notes and PROJECT_STATE.md to current main SHA `bac51aea6afd8ada57d40c877cad81fb5cb9005e` on branch `release/linux-enduser-ready`.
- Confirmed packaging, systemd unit (`User=irp`, `CAP_NET_ADMIN` only), host-authorization fail-closed path, honest status surfaces (including blockers), and operator docs remain accurate for the Linux-first prerelease.
- Explicit remaining blockers listed; release marked prerelease / developer-preview only. Final approval remains with the repository owner.
- Continuous engineer pass: verified non-interactive packaging, fail-closed host trust, PrivilegedMutationBoundary as sole mutation path, and apply → verify → rollback honesty.

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

(Full prior changelog history preserved from main.)

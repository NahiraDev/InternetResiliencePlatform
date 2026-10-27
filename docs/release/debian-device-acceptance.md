# Debian Primary Device Acceptance

This document defines the minimum device-level acceptance contract for the first production IRP device target.

## Reference platform

- OS: Debian 13 (trixie)
- Package format: `.deb`
- Architecture: `amd64` for the first release
- Service manager: systemd
- Runtime: Node.js 24+
- Client package: `@irp/linux-client`
- Service: `irp-linux-client.service`

## CI acceptance

The `Linux Primary Device` workflow must pass all of the following gates:

1. Linux client typecheck, lint, unit tests and build.
2. Debian package generation.
3. Debian package metadata and payload inspection.
4. SHA-256 checksum verification.
5. Package installation with `dpkg`.
6. Dedicated `irp` service account creation.
7. systemd unit validation.
8. Installed client startup and HTTP readiness smoke test.
9. Required Linux package and service files are present after installation.

A failure in any of these checks means the Linux primary-device artifact is not accepted.

## Physical-device acceptance

Before the first production release, the same package must be installed on a real Debian 13 amd64 device and verified for:

- clean installation
- daemon startup
- daemon restart after failure
- reboot persistence
- local diagnostics endpoint
- interface discovery
- route discovery
- DNS state discovery
- normal connectivity observation
- controlled failover/recovery behavior
- clean package upgrade
- clean package removal

Physical-device testing must be recorded as release evidence. CI package tests alone do not constitute physical-device certification.

## Release rule

Linux is the first production device target. The Linux artifact and its acceptance evidence are release-critical. Other platform workflows remain visible and independently verifiable, but unrelated platform failures must not be converted into false-green results or used to suppress a genuine Linux failure.

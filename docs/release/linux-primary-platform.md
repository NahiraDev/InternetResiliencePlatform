# Linux Primary Device Contract

## Status

Linux is the first production device target for IRP. The primary distribution family is Debian-based Linux, with Debian 13 (trixie) as the reference operating-system baseline.

Debian 13 is the current Debian stable release and has a published lifecycle through June 2030. IRP targets `amd64` first; `arm64` is a planned compatibility target after the primary runtime is certified.

## Product boundary

The Linux device is a Full Client. The device-side stack is:

```text
IRP Linux Full Client
  ├── systemd service
  ├── Linux platform adapter
  ├── local diagnostics/control surface
  └── shared IRP Core capability contracts
```

The Linux client must not duplicate routing, policy, scoring, or resilience decision logic that belongs to shared Core services.

## Required runtime properties

- Runs as a dedicated non-root service account.
- Starts after the network is available.
- Restarts after unexpected failure with bounded restart behavior.
- Exposes only the local control surface by default.
- Uses Linux-native networking interfaces for observation and platform integration.
- Remains operational without a desktop environment.
- Uses systemd as the reference service manager.
- Does not silently mutate host networking during diagnostics or CI smoke tests.

Debian documents systemd-networkd as a supported native mechanism for non-GUI network configuration, while modern Debian desktop installations commonly use NetworkManager. The IRP Linux adapter therefore treats the underlying network manager as an integration boundary rather than assuming one daemon owns every interface.

## Primary CI gate

Every pull request and `main` build must keep the Linux package healthy through:

1. frozen dependency installation;
2. Linux client build;
3. Linux client typecheck;
4. Linux client lint;
5. Linux client tests;
6. Debian 13 compatibility smoke validation;
7. systemd unit syntax/contract validation;
8. Debian package construction;
9. package contents and metadata verification.

The Linux gate is release-critical. Failure of an unrelated platform-specific workflow must not be converted into success or hidden with shell success overrides.

## Other platforms

macOS, Windows, iOS, and Android remain supported development targets according to their respective contracts. Their failures remain visible and actionable, but they do not block the Linux-first device release unless a release explicitly declares multi-platform certification.

## Release definition

The first IRP device release is complete only when a real Debian-compatible artifact can be installed, the systemd unit is valid, the daemon starts under the dedicated service account, the local health surface responds, and the package can be removed without leaving an active IRP service behind.

## Host trust and DNS under User=irp

The reference systemd units run the daemon and Linux full client as `User=irp` with only `CAP_NET_ADMIN` ambient.

- **Route mutation** is authorized only when the process is on Linux, holds CAP_NET_ADMIN, has the `ip` binary, and the operator has explicitly opted into live mode.
- **DNS write** currently requires root (`euid === 0`) and `resolvectl` (systemd-resolved). Under `User=irp`, `dns.write` is **not granted** and is reported as a host-authorization blocker. This is intentional fail-closed behaviour for the prerelease; operators must not assume DNS switching works when the service runs as the dedicated non-root account.
- All live network mutation still flows only through `@irp/resilience-runtime` and `PrivilegedMutationBoundary`.

This posture keeps the Linux-first prerelease honest: observation and (when opted-in) route changes are in scope; DNS mutation under the service account is out of scope until a non-root policy (for example polkit) is designed and evidenced.

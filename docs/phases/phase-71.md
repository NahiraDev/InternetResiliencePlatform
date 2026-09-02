# Phase 71 — Cross-Platform Distribution & GitHub Releases

## Status

Implementation started. Phase 71 establishes a single GitHub Release distribution surface for the supported IRP client targets.

## Goal

A user should be able to open the GitHub Releases page from a phone or computer and find the artifact appropriate to the platform instead of navigating the source tree.

## Distribution targets

| Platform | Release artifact | Current boundary |
|---|---|---|
| Android | `IRP-Android-debug.apk` | Debug APK produced by the existing Android client build; device installation is supported for development/testing. |
| Linux | `IRP-Linux-*.tar.gz` | Built Linux client bundle containing the compiled client distribution. |
| macOS | `IRP-macOS-*.tar.gz` | Built macOS client bundle containing the compiled distribution and launchd contract. |
| Windows | `IRP-Windows-*.zip` | Built Windows client bundle containing the compiled client distribution. |
| iOS | `IRP-iOS-source-*.zip` | Source/developer bundle only until an Apple-signed `.ipa` distribution path is configured. |

The release pipeline must never label an unsigned iOS bundle as an installable iOS application.

## Release model

- Releases are created from version tags (`v*`) or manually through `workflow_dispatch` with an explicit tag.
- Each platform build is isolated in its native or required runner.
- Release assets are uploaded to the GitHub Release, not retained only as short-lived workflow artifacts.
- Release creation is fail-closed: if a required build job fails, the release job does not run.
- GitHub Actions permissions are limited to the minimum required for release creation.
- Release artifacts are generated from the repository commit associated with the release tag.

## Installation surface

The canonical human-facing entry point is [`docs/downloads.md`](../downloads.md). The root README links to that page and the GitHub Releases page.

## iOS signing boundary

An installable iOS `.ipa` requires Apple code signing/provisioning and a distribution mechanism such as TestFlight, App Store distribution, or an appropriately signed development/ad-hoc build. Phase 71 deliberately does not invent credentials, certificates, provisioning profiles, or signing secrets. The release pipeline therefore publishes the current iOS source/developer bundle and preserves the distinction between source distribution and device installation.

## Acceptance criteria

1. A version tag produces one GitHub Release containing all successfully built supported-platform assets.
2. Android produces an APK that can be installed on a supported development/test device.
3. Linux, macOS and Windows produce downloadable client bundles.
4. iOS produces an explicitly labelled source/developer bundle until signing is configured.
5. The release workflow fails if a required platform build fails.
6. Release creation does not use `continue-on-error`, `|| true`, or equivalent false-green mechanisms.
7. Release documentation explains exactly what each asset is and is not.
8. The release surface is linked from the root README.

## Verification

Phase 71 completion requires the release workflow to execute successfully from a real version tag and the resulting GitHub Release assets to be inspected. Source presence alone is not completion evidence.

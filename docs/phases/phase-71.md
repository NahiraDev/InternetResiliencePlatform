# Phase 71 — Cross-Platform Distribution & GitHub Releases

## Status

Implementation complete; external release evidence is pending. Phase 71 establishes a single GitHub Release distribution surface for supported IRP client targets.

## Goal

A user should be able to open the GitHub Releases page from a phone or computer and find the artifact appropriate to the platform instead of navigating the source tree.

## Distribution targets

| Platform | Release artifact               | Current boundary                                                                     |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| Android  | `IRP-Android-debug-vX.Y.Z.apk` | Debug APK for development/testing. Production signing remains Phase 72.              |
| Linux    | `IRP-Linux-vX.Y.Z.tar.gz`      | Built Linux client bundle containing the compiled client distribution.               |
| macOS    | `IRP-macOS-vX.Y.Z.tar.gz`      | Built macOS client bundle containing the compiled distribution and launchd contract. |
| Windows  | `IRP-Windows-vX.Y.Z.zip`       | Built Windows client bundle containing the compiled client distribution.             |
| iOS      | `IRP-iOS-source-vX.Y.Z.zip`    | Source/developer bundle only until an Apple-signed distribution path is configured.  |

The release pipeline must never label an unsigned iOS bundle as an installable iOS application.

## Release model

- Releases are created from existing semantic version tags (`vX.Y.Z`) or manually by selecting an existing tag.
- Every build job checks out the exact release tag before producing an artifact.
- Each platform build is isolated in its native or required runner.
- Release assets are uploaded to the GitHub Release, not retained only as short-lived workflow artifacts.
- Release creation is fail-closed: if any required platform build fails, the release job does not run.
- GitHub Actions uses `contents: write` only for the release workflow.
- A machine-readable release contract defines the expected platform asset set.
- Release assets are validated for uniqueness, versioned naming, non-empty content and forbidden unsigned iOS `.ipa` output.
- A `SHA256SUMS.txt` file is generated and verified before publication.

## Installation surface

The canonical human-facing entry point is [`docs/downloads.md`](../downloads.md). The release page is the authoritative artifact surface.

## iOS signing boundary

An installable iOS `.ipa` requires Apple code signing/provisioning and an appropriate distribution mechanism. Phase 71 deliberately does not invent credentials, certificates, provisioning profiles or signing secrets. The pipeline therefore publishes an explicitly labelled iOS source/developer bundle only.

## Acceptance criteria

1. A semantic version tag resolves to one deterministic release source revision.
2. Android produces exactly one versioned APK asset.
3. Linux, macOS and Windows produce exactly one versioned client bundle each.
4. iOS produces exactly one explicitly labelled source/developer ZIP and no `.ipa`.
5. The release job depends on every required platform build.
6. Release validation rejects missing, duplicate, empty or incorrectly versioned assets.
7. Release validation rejects unsigned iOS `.ipa` output.
8. SHA-256 checksums are generated and verified before release publication.
9. Release creation contains no `continue-on-error`, `|| true`, or equivalent false-green mechanism.
10. Human-facing download documentation distinguishes installable artifacts from developer/source bundles.

## Verification

Implementation is complete when the release pipeline is structurally valid and its contract checks pass. Phase 71 is **certified complete only after** a real `vX.Y.Z` tag produces a GitHub Release and every published asset plus checksum file is inspected.

## Release evidence

- **v0.2.0** — <https://github.com/nimarahimloo/InternetResiliencePlatform/releases/tag/v0.2.0> (marked prerelease). Published 2026-10-09 from tag `v0.2.0` on source `a2facc37a6f8607554971d69b0cb89baf88b4cbb` (Release Gate green, run 37898274099). All `SHA256SUMS.txt` checksums verify. Post-publication inspection found packaging defects, so it must not be treated as certified: the Linux bundle could not resolve its workspace dependencies outside the monorepo, the iOS source zip carried ~6,400 generated SwiftPM `.build/` files, and the Windows zip used backslash entry names.
- **v0.2.1** — <https://github.com/nimarahimloo/InternetResiliencePlatform/releases/tag/v0.2.1>. Published 2026-10-09 from the same source tag (`a2facc3`) by the `IRP Release` workflow run [37913149488](https://github.com/nimarahimloo/InternetResiliencePlatform/actions/runs/37913149488) dispatched from branch `fix/release-windows-package-env-expansion` (PR #2). Every platform job is green, including a fail-closed Linux bundle smoke test that installs the extracted bundle with pnpm and probes `GET /health`. Asset inspection (2026-10-09): exactly one versioned asset per platform, no `.ipa`, all non-empty, all `SHA256SUMS.txt` entries verified against downloads. The Linux bundle is a self-contained installable pnpm mini-workspace (client plus its full transitive `@irp` dependency closure); the iOS zip contains tracked source only; the Windows zip uses forward-slash entry names.
- **Provenance**: application source `a2facc3` (tag `v0.2.1`, Release Gate green); packaging workflow revision = the head of `fix/release-windows-package-env-expansion` at dispatch time. The tag predates the packaging fixes; the fixes live on the release pipeline revision and PR #2.
- **Not satisfied by this evidence** (remains open, tracked in issue #1): production certification inputs from the release roadmap Step 6 — device/runtime smoke tests, signed Android release engineering, regional validation, security sign-off, upgrade/rollback and backup/restore rehearsals. The Android asset is a debug APK by design; iOS ships a source/developer bundle only.

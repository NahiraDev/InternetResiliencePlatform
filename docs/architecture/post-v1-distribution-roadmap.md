# Post-v1 Client Distribution Roadmap

This document extends the Phase 70 baseline with the delivery phases required to turn platform client implementations into end-user install/update channels. These phases do not change Core authority or client networking architecture.

## Phase 71 — Cross-Platform Distribution & GitHub Releases

Publish versioned client artifacts through GitHub Releases with one platform-aware download surface.

- Android APK build and release asset.
- Linux client bundle.
- macOS client bundle.
- Windows client bundle.
- iOS developer/source bundle until Apple signing is configured.
- Fail-closed release workflow.
- Human-facing download documentation.

**Done when:** a real tagged release succeeds and all published assets are inspected.

## Phase 72 — Signed Mobile Distribution

Turn the iOS and Android release boundaries into platform-native distribution channels without moving product authority into the clients.

- Android release signing and production APK/AAB policy.
- iOS signing/provisioning and production `.ipa`/TestFlight distribution path.
- Release credential handling through GitHub Actions secrets/environments.
- Device installation smoke tests.
- Platform version compatibility evidence.

**Done when:** signed builds are installable on representative physical devices and the release evidence is retained.

## Phase 73 — Native Desktop Installers

Move Linux, macOS and Windows from downloadable runtime bundles to native installation packages.

- Linux package/install contract.
- macOS application/service installation contract.
- Windows installer/service installation contract.
- Uninstall and rollback behavior.
- Upgrade compatibility tests.
- Artifact checksums and provenance metadata.

**Done when:** a clean machine can install, start, upgrade, rollback and uninstall each supported desktop client using the published release artifact.

## Phase 74 — Release Channels & Updates

Establish controlled update distribution after signed/native installers are proven.

- Stable release channel.
- Pre-release/testing channel.
- Version compatibility and minimum-supported-version policy.
- Update metadata and release discovery.
- Safe upgrade/rollback enforcement.
- Release evidence and audit trail.

**Done when:** clients can discover an authorized compatible release and complete a verified upgrade/rollback rehearsal.

## Dependency order

```text
Phase 70 Certification
        |
        v
Phase 71 GitHub Releases
        |
        v
Phase 72 Signed Mobile Distribution
        |
        v
Phase 73 Native Desktop Installers
        |
        v
Phase 74 Release Channels & Updates
```

A later phase must not be marked complete by source presence alone. Each phase requires actual artifact, installation/runtime and CI evidence appropriate to the target platform.

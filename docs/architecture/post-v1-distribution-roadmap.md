# Archived Post-v1 Client Distribution Roadmap

> **Historical / superseded:** This document preserves an earlier post-v1 distribution sequencing proposal. It is not the current Phase 72–150 roadmap and must not be used to assign current phase ownership.
>
> The current roadmap authority is [`../roadmap/MASTER_ROADMAP_V2.md`](../roadmap/MASTER_ROADMAP_V2.md). Current implementation status is authoritative in [`../../PROJECT_STATE.md`](../../PROJECT_STATE.md).

The proposal below is retained for historical context. Its phase numbers conflict with the current roadmap and therefore must not be treated as current execution instructions.

## Historical proposal: Phase 71 — Cross-Platform Distribution & GitHub Releases

Publish versioned client artifacts through GitHub Releases with one platform-aware download surface.

- Android APK build and release asset.
- Linux client bundle.
- macOS client bundle.
- Windows client bundle.
- iOS developer/source bundle until Apple signing is configured.
- Fail-closed release workflow.
- Human-facing download documentation.

**Historical completion condition:** a real tagged release succeeds and all published assets are inspected.

## Historical proposal: Phase 72 — Signed Mobile Distribution

The earlier proposal intended to turn the iOS and Android release boundaries into platform-native distribution channels without moving product authority into clients.

- Android release signing and production APK/AAB policy.
- iOS signing/provisioning and production `.ipa`/TestFlight distribution path.
- Release credential handling through GitHub Actions secrets/environments.
- Device installation smoke tests.
- Platform version compatibility evidence.

This proposal is superseded. Signed mobile distribution is not the current Phase 72 contract.

## Historical proposal: Phase 73 — Native Desktop Installers

The earlier proposal covered native Linux, macOS and Windows installation packages, uninstall/rollback behavior and upgrade compatibility.

This proposal is superseded by the current Phase 73 — Unified Network State Model in `MASTER_ROADMAP_V2.md`.

## Historical proposal: Phase 74 — Release Channels & Updates

The earlier proposal covered stable/pre-release channels, compatibility policy, update discovery and safe upgrade/rollback.

This proposal is superseded by the current Phase 74 — Control-Plane Contracts in `MASTER_ROADMAP_V2.md`.

## Current relationship

The current architecture track is:

```text
Phase 71 — Cross-Platform Distribution & GitHub Releases
        |
        v
Phase 72 — Control-Plane Architecture Completion
        |
        v
Phase 73 — Unified Network State Model
        |
        v
Phase 74 — Control-Plane Contracts
        |
        v
Phase 75 — Decision Orchestration
        |
        v
Phase 76 — Action Transaction Engine
        |
        v
Phase 77 — Safety, Rollback & Recovery Kernel
        |
        v
Phase 78 — Closed-Loop Control Foundation
```

Do not revive the historical signed-mobile/native-installer numbering without an explicit roadmap change and architecture decision.

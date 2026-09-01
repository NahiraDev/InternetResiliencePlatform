# Phase 67 — Android Full Client

## Status

**Implementation started; verification required.**

Phase 67 establishes the Android Full Client boundary. It mirrors the capability model used by the iOS client while keeping routing, DNS, gateway selection, failover, tunnel execution and other safety-critical decisions in the shared Core/Control Plane.

## Implementation evidence

- `clients/android/settings.gradle.kts`
- `clients/android/build.gradle.kts`
- `clients/android/app/build.gradle.kts`
- `clients/android/app/src/main/AndroidManifest.xml`
- `clients/android/app/src/main/java/com/nahiradev/irp/Models.kt`
- `clients/android/app/src/main/java/com/nahiradev/irp/SecureTokenStore.kt`
- `clients/android/app/src/main/java/com/nahiradev/irp/ControlPlane.kt`
- `clients/android/app/src/main/java/com/nahiradev/irp/ClientSession.kt`
- `clients/android/app/src/main/java/com/nahiradev/irp/NetworkDiagnostics.kt`
- `clients/android/app/src/main/java/com/nahiradev/irp/MainActivity.kt`
- `clients/android/app/src/test/java/com/nahiradev/irp/ClientSessionTest.kt`
- `clients/android/README.md`
- `.github/workflows/android-client.yml`

## Guarantees

- Android is modeled as a full product client, not a dashboard-only viewer.
- Enrollment and policy changes cross an explicit `ControlPlaneClient` boundary.
- Refresh credentials are stored through an Android Keystore-backed AES-GCM store.
- Session refresh publishes the network snapshot and analytics only after both Control Plane reads succeed.
- Failed policy requests do not mutate local policy state.
- Sign-out clears the stored credential and local enrollment state.
- Android connectivity inspection is read-only.
- Phase 67 introduces no VPN/tunnel execution or Android privileged networking path.

## Remaining verification

- Android dependency resolution and Gradle unit tests.
- Debug APK compilation.
- Static analysis and repository validation/typecheck/lint/build.
- Android emulator smoke test.
- Physical-device installation and lifecycle verification.
- Keystore behavior verification on supported API levels.
- Control Plane transport integration against the canonical API.
- Security review of credential storage, exported components, network transport and session boundaries.
- Green CI.

## Phase 68 boundary

Android VPN/network integration remains explicitly deferred to Phase 68. Phase 68 must consume the shared Control Plane-authorized tunnel contracts and must not introduce a second gateway selection, routing policy, failover or tunnel protocol stack.

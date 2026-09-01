# IRP Android Full Client

Phase 67 provides the Android full-client boundary for Internet Resilience Platform.

## Responsibilities

- Android-native presentation of shared IRP capability state.
- Enrollment/session lifecycle through `ControlPlaneClient`.
- Keystore-backed refresh credential storage.
- Read-only Android connectivity diagnostics.
- Analytics and policy presentation.
- Explicit policy requests delegated to the Control Plane.

## Non-responsibilities

Phase 67 does **not** implement VPN/tunnel execution, gateway selection, routing policy, DNS mutation, failover algorithms, or privileged packet handling. Those responsibilities belong to shared Core/Control Plane contracts and Phase 68 Android-native networking.

## Build

Requirements:

- Android SDK 35
- JDK 17+
- Gradle 8.10+

From `clients/android`:

```bash
gradle :app:testDebugUnitTest
gradle :app:assembleDebug
```

Android Studio can import `clients/android` directly.

## Verification boundary

Repository tests can validate session, policy and credential boundaries. Device-level verification remains required before Phase 67 closure, including installation, lifecycle/background behavior, Android Keystore behavior on supported API levels, and UI/runtime smoke testing on representative Android devices.

# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current State

- **Current phase:** Phase 67 — Android Full Client (**implementation started; repository/device/runtime verification required**).
- **Phase 67:** Android full-client boundary is implemented under `clients/android`; enrollment/session, Keystore-backed credentials, persisted device identity, read-only diagnostics, analytics/policy contracts, Compose presentation, tests and Android CI scaffolding are present. Android emulator/device verification and canonical Control Plane transport integration remain required before closure.
- **Phase 66:** native iOS Network Extension boundary is implemented under `clients/ios`; packet-tunnel configuration validation, `NETunnelProviderManager` lifecycle, `NEPacketTunnelProvider` extension metadata/entitlements, and Xcode project scaffolding are present. Signed physical-device verification and a concrete authorized tunnel transport remain required before closure.
- **Phase 65:** native iOS full-client boundary is implemented under `clients/ios`; enrollment/session, Keychain-backed credentials, diagnostics/analytics presentation and policy requests are covered. iOS simulator/device verification remains required before closure.
- **Phase 64:** shared platform-neutral mobile client core is implemented in `@irp/core`; repository/runtime verification remains required before closure.
- **Phase 63:** Windows Full Client implementation is on `main`; native Windows runtime and CI verification remain required before closure.
- **Phase 62:** implementation is on `main`; final macOS runtime and CI verification evidence is still required before closure.
- **Phase 61:** implementation remains subject to full repository/runtime verification under the phase verification rules.
- **Phase 60:** implementation was merged to `main` by PR #170; its final verification status remains governed by the phase verification rules.
- **Phase 59:** implementation is merged to `main`; final closure remains governed by repository/runtime evidence.
- **Phase 58:** implementation is merged to `main`; final verification evidence remains required.
- **Phase 54:** implementation is in `@irp/gateway-registry`; final repository/CI verification remains required.
- **Phase 53:** implementation is complete, but its final verification gate remains explicitly tracked until the verified fix is accepted on `main`.
- **Phase 52:** implementation is complete, but final repository/runtime verification is still required.
- **Phase 51:** implementation is complete and accepted after repository/CI verification on `main`.
- **Phase 50:** OpenVPN provider implementation is complete and accepted after repository/runtime verification.
- **Phase 49:** WireGuard provider implementation is complete and accepted after CI/runtime verification.
- **Phase 48:** secure tunnel abstraction is complete and accepted after verification.
- **Phase 47:** gateway discovery and health is verified green and accepted.
- **Roadmap:** 70 phases total and immutable as the current baseline. Additional execution/hardening phases may be proposed only after Phase 70 CTO/architecture review.
- **Core architecture:** headless Core + unified Control Plane + full-capability clients.
- **Client strategy:** Linux, macOS, Windows, iOS and Android are full product clients; mobile is not dashboard-only.
- **Gateway strategy:** `@irp/gateway-registry` owns gateway inventory/discovery/health, deterministic gateway selection, multi-gateway failover coordination and fleet operations. `@irp/tunnel` owns tunnel contracts, lifecycle and concrete providers. Do not duplicate these domains.
- **UI strategy:** Web Control Center begins at Phase 57 and never owns safety-critical routing logic. Desktop and mobile clients consume shared capability contracts and do not duplicate routing/policy intelligence.
- **Notification strategy:** Phase 59 owns operational incident/notification state and alert presentation contracts. It must not gain authority over routing, DNS, tunnel or gateway mutations.
- **Administration strategy:** Phase 60 owns operator configuration, self-hosting, migrations, backups, restore safety and maintenance tooling. It must not gain routing, DNS, tunnel or gateway execution authority.
- **Linux client strategy:** Phase 61 owns Linux process/platform integration, local diagnostics presentation and client-local controls. Safety-critical routing, DNS, tunnel, gateway and failover decisions remain in shared Core/Control Plane.
- **macOS client strategy:** Phase 62 owns macOS process/platform integration, local diagnostics presentation and client-local controls. Safety-critical routing, DNS, tunnel, gateway and failover decisions remain in shared Core/Control Plane.
- **Windows client strategy:** Phase 63 owns Windows process/platform integration, local diagnostics presentation and client-local controls. Safety-critical routing, DNS, tunnel, gateway and failover decisions remain in shared Core/Control Plane.
- **Mobile client strategy:** Phase 64 provides platform-neutral shared state, diagnostics and local policy contracts in `@irp/core`. Native OS networking and privileged integrations remain behind platform adapters in Phases 65–68.
- **iOS client strategy:** Phase 65 owns native iOS presentation, enrollment/session lifecycle, secure credential storage, diagnostics/analytics presentation and explicit Control Plane policy requests. Network Extension and privileged system networking remain exclusively in Phase 66.
- **iOS network integration strategy:** Phase 66 owns the Network Extension execution boundary and VPN profile lifecycle. It may apply only Control Plane-authorized tunnel configuration. It must not implement gateway selection, destination policy, failover decisions or a second tunnel protocol stack.
- **Android client strategy:** Phase 67 owns Android-native presentation, enrollment/session lifecycle, secure credential storage, diagnostics/analytics presentation and explicit Control Plane policy requests. VPN/network execution remains exclusively in Phase 68.
- **Android network integration strategy:** Phase 68 owns Android VPN/network execution and must consume Control Plane-authorized tunnel contracts. It must not duplicate gateway selection, destination policy, failover decisions or a second tunnel protocol stack.
- **Trusted-source CI workflow:** keep the existing trusted source artifact workflow semantics unchanged.
- **README policy:** keep the root README concise; detailed architecture, procedures and phase history belong under `docs/`.

## Phase 67 — Android Full Client

**Implementation started; verification required.**

### Implementation evidence

- `clients/android/settings.gradle.kts`
- `clients/android/build.gradle.kts`
- `clients/android/app/build.gradle.kts`
- `clients/android/app/src/main/AndroidManifest.xml`
- `clients/android/app/src/main/java/com/nahiradev/irp/Models.kt`
- `clients/android/app/src/main/java/com/nahiradev/irp/SecureTokenStore.kt`
- `clients/android/app/src/main/java/com/nahiradev/irp/IdentityStore.kt`
- `clients/android/app/src/main/java/com/nahiradev/irp/ControlPlane.kt`
- `clients/android/app/src/main/java/com/nahiradev/irp/ClientSession.kt`
- `clients/android/app/src/main/java/com/nahiradev/irp/NetworkDiagnostics.kt`
- `clients/android/app/src/main/java/com/nahiradev/irp/ComposeCompat.kt`
- `clients/android/app/src/main/java/com/nahiradev/irp/MainActivity.kt`
- `clients/android/app/src/test/java/com/nahiradev/irp/ClientSessionTest.kt`
- `clients/android/app/src/test/java/com/nahiradev/irp/SessionRestoreTest.kt`
- `.github/workflows/android-client.yml`
- `docs/phases/phase-67.md`

### Current guarantees

- Android is modeled as a full product client, not a dashboard-only viewer.
- Enrollment and policy changes cross an explicit `ControlPlaneClient` boundary.
- Refresh credentials are stored through an Android Keystore-backed AES-GCM store.
- Device identity is persisted separately and restored only when both identity and credential are present.
- Snapshot and analytics refresh state only after both Control Plane reads succeed.
- Failed policy requests do not mutate local policy state.
- Sign-out clears the stored credential, identity and local enrollment state.
- Android connectivity inspection is read-only.
- Phase 67 introduces no VPN/tunnel execution or privileged packet networking path.

### Remaining verification

- Android dependency resolution and Gradle unit tests.
- Debug APK compilation.
- Repository `pnpm validate`, typecheck, lint, tests and build.
- Android emulator smoke test.
- Physical-device installation and lifecycle verification.
- Keystore behavior verification on supported API levels.
- Control Plane transport integration against the canonical API.
- Security review of credential storage, exported components, network transport and session boundaries.
- Green CI.

## Phase 66 — iOS Network Integration

**Implementation started; verification required.**

### Implementation evidence

- `clients/ios/Sources/IRPiOSClient/PacketTunnelConfiguration.swift`
- `clients/ios/Sources/IRPiOSClient/NetworkExtensionAdapter.swift`
- `clients/ios/Sources/IRPiOSClient/NetworkExtensionController.swift`
- `clients/ios/PacketTunnel/PacketTunnelProvider.swift`
- `clients/ios/PacketTunnel/Info.plist`
- `clients/ios/PacketTunnel/PacketTunnel.entitlements`
- `clients/ios/App/IRP.entitlements`
- `clients/ios/App/IRPiOSApp.swift`
- `clients/ios/App/Info.plist`
- `clients/ios/IRP.xcodeproj/project.pbxproj`
- `clients/ios/IRP.xcodeproj/xcshareddata/xcschemes/IRP.xcscheme`
- `clients/ios/Tests/IRPiOSClientTests/PacketTunnelConfigurationTests.swift`
- `.github/workflows/ios-network-integration.yml`
- `docs/phases/phase-66.md`

### Current guarantees

- Packet tunnel configuration is validated before native network settings are created.
- IPv4, DNS, MTU, included routes and excluded routes map deterministically to `NEPacketTunnelNetworkSettings`.
- The containing app manages `NETunnelProviderManager`; it does not edit host routing tables directly.
- The packet tunnel provider reads the control-plane-generated provider configuration and fails closed if no authorized concrete transport is available.
- The packet tunnel extension uses the dedicated Apple packet-tunnel extension point and `packet-tunnel-provider` entitlement.
- No WireGuard/OpenVPN implementation, gateway scoring, destination policy or failover algorithm is duplicated in iOS code.

### Remaining verification

- repository `pnpm validate`, typecheck, lint, tests and build;
- Swift package tests/build;
- Xcode project compilation against an iOS Simulator SDK;
- entitlement and extension metadata validation;
- signed physical iPhone installation and Network Extension lifecycle smoke test;
- concrete authorized tunnel transport integration and end-to-end packet forwarding;
- security review of entitlements, credential/session boundaries and fail-closed startup behavior.

## Phase 65 — iOS Full Client

**Implementation started; verification required.**

### Implementation evidence

- `clients/ios/Package.swift`
- `clients/ios/Sources/IRPiOSClient/Models.swift`
- `clients/ios/Sources/IRPiOSClient/SecureStore.swift`
- `clients/ios/Sources/IRPiOSClient/ClientSession.swift`
- `clients/ios/Sources/IRPiOSClient/Views.swift`
- `clients/ios/Tests/IRPiOSClientTests/IRPiOSClientTests.swift`
- `clients/ios/README.md`
- `docs/phases/phase-65.md`
- `.github/workflows/ios-client.yml`

### Current guarantees

- Enrollment persists the returned refresh credential only through the secure-store abstraction; the production Apple implementation uses Keychain.
- Session restore requires both a stored credential and an enrolled device identity.
- Snapshot and analytics refresh state only after both control-plane reads succeed, preventing partial refresh publication.
- Policy changes are delegated to the Control Plane; failed policy requests leave local policy state unchanged.
- Sign-out removes the stored refresh credential and clears local enrollment state.
- SwiftUI presentation is read-oriented and contains no routing, DNS, gateway, tunnel or failover authority.
- Phase 65 introduces no Network Extension entitlement or privileged networking path.

## Phase 64 — Shared Mobile Client Core

**Implementation started; verification required.**

### Implementation evidence

- `packages/core/src/mobile-client.ts`
- `packages/core/tests/mobile-client.test.ts`
- `packages/core/src/index.ts`
- `docs/phases/phase-64.md`
- `docs/reference/packages.md`
- `docs/runtime/index.html`

### Current guarantees

- iOS and Android are the only accepted mobile platform identifiers.
- Initial client state is deterministic and platform-neutral.
- Client policy state is isolated from caller-owned state snapshots.
- Diagnostics are read-only through an adapter contract; the core does not execute native networking commands.
- Platform-mismatched diagnostics are rejected before state mutation.
- Adapter failures leave the previous client state unchanged.
- Policy, snapshot and connection transitions are observable through local events.
- The runtime dashboard resolves hosted HTTP(S) deployments to same-origin `/runtime-api`; explicit `?api=` overrides remain supported, while local `file://` use continues to target the local runtime lab at `127.0.0.1:8080`.

### Remaining verification

- repository `pnpm validate`;
- repository typecheck, lint, tests and build;
- `@irp/core` mobile-core test execution;
- public runtime dashboard loading through the Caddy `/runtime/` route with `/runtime-api` SSE connectivity;
- runtime/public soak verification and CI.

## Phase 63 — Windows Full Client

**Implementation in progress; verification required.**

### Implementation evidence

- `packages/windows-client/package.json`
- `packages/windows-client/tsconfig.json`
- `packages/windows-client/src/index.ts`
- `packages/windows-client/tests/index.test.ts`
- `docs/phases/phase-63.md`
- `.github/workflows/windows-client.yml`

### Current guarantees

- Windows diagnostics use bounded `execFile` calls rather than shell interpolation.
- Interface, route and resolver state are presented as observations; the client does not mutate network state.
- Autonomous mode is explicit, deterministic and locally controlled; it does not bypass the shared safety/policy boundary.
- The local control surface binds to loopback only by default.
- Non-Windows environments report a deterministic unsupported state rather than pretending Windows runtime evidence exists.

### Remaining verification

- real Windows diagnostics using `ipconfig`, `route` and `netsh`;
- Windows service lifecycle verification;
- desktop UI/tray integration verification on supported Windows environments;
- repository typecheck/lint/test/build and Windows CI green.

## Verification Rules

A phase is not complete because source files exist. Completion requires acceptance criteria plus repository verification and, where relevant, runtime/online evidence.

For every phase:

1. inspect existing implementation before adding abstractions;
2. preserve compatible contracts unless a breaking change is explicitly required;
3. add normal, boundary, invalid and failure-path tests;
4. run repository validation, typecheck, lint, relevant tests and build;
5. apply security/abuse review to security-sensitive changes;
6. verify runtime behavior for networking/process/container changes;
7. update documentation and project state;
8. require green CI before marking the phase complete.

For networking automation, every mutation must be policy-checked, bounded, observable, reversible and auditable.

## Product Objective

```text
Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check
→ Apply → Verify → Monitor → Failover/Recover → Learn → Explain
```

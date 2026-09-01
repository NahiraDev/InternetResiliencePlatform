# InternetResiliencePlatform — Canonical Project State

> Authoritative handoff point for continuing development from any account, agent, or future session.

## Current State

- **Current phase:** Phase 68 — Android-native VPN/network integration (**implementation started; verification required**).
- **Phase 68:** Android `VpnService` execution boundary is implemented under `clients/android`; validated tunnel configuration, explicit packet-forwarding transport boundary, fail-closed startup, lifecycle cleanup, VPN service registration and configuration tests are present. Android CI/emulator/device verification and concrete authorized packet forwarding remain required before closure.
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

## Phase 68 — Android-native VPN/network integration

**Implementation started; verification required.**

### Implementation evidence

- `clients/android/app/src/main/java/com/nahiradev/irp/VpnTunnel.kt`
- `clients/android/app/src/main/AndroidManifest.xml`
- `clients/android/app/src/test/java/com/nahiradev/irp/VpnTunnelConfigTest.kt`
- `docs/phases/phase-68.md`

### Current guarantees

- Android VPN execution is isolated behind `VpnTunnelController` and `VpnService`.
- Tunnel configuration is strongly typed and rejects malformed virtual addresses, prefixes, remote endpoints and MTUs.
- Valid configuration maps deterministically to Android VPN address, route, DNS and MTU settings.
- Packet forwarding is an explicit dependency rather than a duplicate protocol implementation.
- The default unavailable transport fails closed before leaving a black-hole VPN interface behind.
- VPN service cleanup closes the descriptor and transport on stop/destruction.
- The VPN service is non-exported and protected by `BIND_VPN_SERVICE`.
- Gateway selection, destination policy, failover and tunnel protocol selection remain outside the Android client.

### Remaining verification

- Android dependency resolution and Gradle unit tests.
- Debug APK compilation.
- Repository `pnpm validate`, typecheck, lint, tests and build.
- Android emulator smoke test.
- Physical-device installation and VPN lifecycle verification.
- Concrete Control Plane-authorized packet-forwarding transport integration.
- Security review of VPN permissions, exported components, configuration validation and fail-closed startup.
- Green CI.

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

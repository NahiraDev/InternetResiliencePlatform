# Phase 66 — iOS Network Integration

## Goal

Integrate the iOS Full Client with Apple's Network Extension framework while preserving the IRP authority boundary: native networking is an execution adapter, while routing, destination policy, gateway selection, tunnel selection and failover decisions remain in the Core/Control Plane.

## Scope

- `NETunnelProviderManager` lifecycle controller for installing/loading/updating/removing the managed VPN configuration.
- `NEPacketTunnelProvider` implementation for the dedicated packet-tunnel extension target.
- Strongly typed tunnel configuration shared between the containing app and extension boundary.
- Deterministic translation of IRP tunnel configuration into `NEPacketTunnelNetworkSettings`.
- Explicit packet-forwarding transport boundary so the extension does not contain a duplicate tunnel protocol implementation.
- Start/stop/cancel lifecycle handling and bounded cleanup.
- iOS entitlements and extension metadata for `packet-tunnel-provider`.
- Unit tests for configuration validation, settings translation and lifecycle-safe failure behavior.
- macOS-hosted CI validation of Swift package code plus Xcode project compilation against the iOS Simulator SDK without code signing.

## Out of scope

- Implementing a second tunnel protocol inside the iOS client.
- Duplicating WireGuard/OpenVPN/gateway selection or failover logic.
- Silent route/DNS changes outside the configured Network Extension profile.
- Production App Store signing, provisioning and distribution certificates.
- Final physical-device VPN soak; that requires a real Apple signing environment and a registered/test device.

## Security boundaries

1. The packet tunnel extension receives an already-authorized tunnel configuration; it does not choose gateways, routes, DNS policy or tunnel providers.
2. The extension must reject malformed or incomplete configuration before touching network settings.
3. The packet-forwarding transport is an explicit dependency. The extension must fail closed when no transport is available.
4. The containing app only manages the Network Extension profile and presents state; it does not directly mutate system routing tables.
5. The `packet-tunnel-provider` entitlement is isolated to the extension target.

## Acceptance criteria

1. `NETunnelProviderManager` lifecycle is exposed through a testable controller.
2. The extension target uses `NEPacketTunnelProvider` and the Apple packet-tunnel extension point.
3. IRP tunnel configuration validates non-empty virtual addresses, subnet mask, remote endpoint and bounded MTU.
4. The translation layer produces deterministic `NEPacketTunnelNetworkSettings` including IPv4, DNS, MTU and routes.
5. Start failure before a transport is available is explicit and does not leave a half-configured state.
6. Stop and cancellation release the packet-forwarding task and complete cleanly.
7. Unit tests cover normal, invalid, boundary and failure cases.
8. CI builds the Xcode project for the iOS Simulator without signing and runs the Swift tests.
9. No routing intelligence or concrete WireGuard/OpenVPN implementation is duplicated inside `clients/ios`.

## Verification gates

Phase 66 remains **in progress** until:

- `pnpm validate`, typecheck, lint, tests and build remain green;
- Swift package tests/build are green;
- Xcode project compilation for the iOS Simulator is green;
- Network Extension entitlements and extension metadata are validated;
- a signed iOS build is installed on a real iPhone and the Network Extension lifecycle is smoke-tested;
- security review confirms least-privilege entitlement scope and fail-closed behavior.

Phase 67 (Android Full Client) is not started by this phase.

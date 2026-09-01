# Phase 68 — Android-native VPN/network integration

## Status

**Implementation started; verification required.**

## Goal

Integrate the Android Full Client with `VpnService` while preserving the IRP authority boundary: Android is an execution adapter only. The Core/Control Plane remains authoritative for routing, destination policy, gateway selection, tunnel selection and failover.

## Scope

- Android `VpnService` lifecycle boundary.
- Strongly typed, validated Control Plane-authorized VPN configuration.
- Deterministic translation of the authorized configuration into an Android VPN interface.
- Explicit packet-forwarding transport dependency; no duplicate WireGuard/OpenVPN implementation in the Android client.
- Start/stop and bounded cleanup lifecycle.
- Android VPN service registration with the least-privilege `BIND_VPN_SERVICE` permission.
- Unit tests for normal, invalid and boundary configuration behavior.

## Out of scope

- Gateway selection or scoring in the Android client.
- Destination policy or failover algorithms in the Android client.
- A second WireGuard/OpenVPN protocol implementation.
- Silent host routing-table mutation outside `VpnService`.
- Treating a TUN interface as a functioning tunnel when packet forwarding is unavailable.

## Security boundaries

1. Android receives an already-authorized tunnel configuration; it does not select gateways or routes.
2. Malformed configuration is rejected before VPN establishment.
3. A concrete packet-forwarding transport is an explicit dependency. The default implementation fails closed, preventing a black-hole VPN.
4. The Android service owns only the OS VPN interface lifecycle.
5. The VPN service is non-exported and protected by `android.permission.BIND_VPN_SERVICE`.

## Acceptance criteria

1. A testable Android VPN controller exposes start/stop lifecycle state.
2. The Android client registers a dedicated `VpnService` using `BIND_VPN_SERVICE`.
3. VPN configuration validates virtual address, prefixes, remote endpoint and bounded MTU.
4. Valid configuration deterministically maps to `VpnService.Builder` address, route, DNS and MTU settings.
5. Startup fails closed when no packet-forwarding transport is available.
6. Stop and service destruction release the VPN descriptor and transport cleanly.
7. Unit tests cover valid, invalid and boundary configuration cases.
8. No gateway selection, routing intelligence, failover algorithm or concrete tunnel protocol is duplicated in `clients/android`.
9. Android CI remains green for unit tests and debug APK compilation.

## Verification gates

Phase 68 remains **in progress** until repository validation, Android tests/build, security review and Android emulator/device lifecycle verification provide the required evidence. End-to-end packet forwarding additionally requires a concrete authorized transport supplied behind the transport boundary.

# Phase 65 — iOS Full Client

## Goal

Establish the iOS Full Client as a native presentation and device-control surface over the shared IRP capability model. The client owns enrollment/session UX, secure credential storage, diagnostics presentation, analytics presentation and explicit policy controls. Core/Control Plane remains authoritative for routing, DNS, gateway, tunnel and failover decisions.

## Scope

- Native SwiftUI client presentation boundary.
- Device enrollment and control-plane session lifecycle.
- Apple Keychain-backed refresh-token storage.
- Read-only network snapshot presentation.
- Historical analytics summary presentation.
- Explicit autonomous-mode policy control delegated to the Control Plane.
- Failure-safe state transitions: failed refresh/policy calls do not partially mutate local state.
- macOS-hosted Swift Package Manager validation for deterministic CI coverage.

## Out of scope

- Network Extension or packet/network tunnel integration; this belongs to Phase 66.
- Direct route, DNS, firewall, gateway or tunnel mutation from iOS UI code.
- Local copies of routing, scoring, failover or policy-decision algorithms.

## Security boundaries

1. Refresh credentials are stored through the platform secure-store abstraction; production iOS uses Keychain.
2. The UI cannot grant itself routing or network mutation authority.
3. Autonomous mode is a policy request sent to the Control Plane, not a local execution switch.
4. Network observations are treated as untrusted evidence and are displayed, not interpreted as authorization.
5. Phase 65 introduces no Network Extension entitlement or privileged network mutation path.

## Acceptance criteria

1. `clients/ios` contains a buildable Swift Package with a native SwiftUI client surface.
2. Enrollment persists the returned refresh credential only through the secure-store abstraction.
3. Session restore requires both a stored credential and an enrolled device identity.
4. Snapshot and analytics refreshes update the published state only after all required reads succeed.
5. A rejected policy update leaves the prior local policy unchanged.
6. Signing out clears the enrollment state and secure refresh credential.
7. Unit tests cover normal, boundary and failure paths for enrollment, refresh, policy and sign-out.
8. CI runs `swift test --package-path clients/ios` on macOS.
9. No Phase 65 code executes privileged network changes or duplicates Core decision logic.

## Verification gates

Phase 65 remains **in progress** until the following evidence is green:

- repository `pnpm validate`, typecheck, lint, tests and build;
- Swift package test/build on macOS;
- iOS simulator/device UI smoke verification on a supported Xcode environment;
- security review of Keychain/session lifecycle;
- repository CI is green.

Source presence alone does not close the phase. Phase 66 owns native Network Extension integration and must remain a separate architectural boundary.

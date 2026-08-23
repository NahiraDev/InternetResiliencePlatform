# Full Client Model

IRP clients are product surfaces, not thin dashboards. A Full Client consumes shared capability contracts and presents the capabilities that the platform and operating system permit.

## Platforms

- Linux desktop
- macOS desktop
- Windows desktop
- iOS
- Android
- Web Control Center

## Shared capability model

Where the platform and client role permit, clients can:

- enroll and manage the device identity;
- view network health and current resilience state;
- inspect path and gateway state;
- inspect diagnostics and analytics;
- manage explicitly permitted policies;
- receive notifications;
- request permitted recovery actions.

A client must never infer administrative authority from the availability of a UI control. Authorization is enforced by the control plane.

## Native boundaries

Operating-system networking APIs, permissions, background execution, secure storage, notifications and lifecycle behavior belong in platform adapters. Core policy and decision logic is not copied into each client.

## Mobile is first-class

iOS and Android are first-class client platforms in the 70-phase product plan. Mobile is not permanently defined as a remote dashboard. The eventual Full Client can expose the same canonical product capabilities where the OS permits them.

When an OS does not permit a capability, the client must represent the limitation explicitly. It must not simulate unsupported network control or silently degrade security guarantees.

## Client lifecycle

All Full Clients follow the common enrollment/authentication/reconnect/revocation model documented in [Client Onboarding](../getting-started/client-onboarding.md).

## Architecture invariant

Client UI and native networking code are adapters. The authoritative policy, routing decision and safety semantics remain in the shared platform/control-plane architecture.

# Full Client Model

IRP clients are product surfaces, not thin dashboards. A Full Client consumes the shared capability API and presents the capabilities that the platform and operating system permit.

## Platforms

- Linux desktop
- macOS desktop
- Windows desktop
- iOS
- Android
- Web Control Center

## Shared capabilities

Where the platform permits, clients can manage enrollment, view network health, inspect current path and gateway state, manage policies, inspect diagnostics and analytics, receive notifications, and request permitted recovery actions.

## Native boundaries

Operating-system networking APIs, permissions, background execution, secure storage, notifications, and lifecycle behavior are implemented in platform adapters. Core policy and decision logic is not copied into each client.

## Mobile principle

Mobile is a first-class client. It is not merely a remote dashboard. Capability availability is determined by the native OS security and networking APIs, and unsupported operations must be represented explicitly rather than simulated.

# Security Boundaries

Security boundaries must remain explicit as IRP grows from a core runtime into a multi-device platform.

## Trust zones

```text
User / Device
     │
     │ authenticated API
     ▼
Control Plane
     │
     │ authorized capability
     ▼
Core / Resilience Runtime
     │
     ├── DNS / Routing
     ├── Tunnel adapters
     └── Gateway adapters
```

## Rules

- Authentication establishes identity; authorization decides capability.
- Device credentials and gateway credentials are separate trust domains.
- Secrets must not be written to normal application logs, telemetry attributes or analytics records.
- Network mutations require an explicit capability and policy decision.
- Provider-specific credentials stay inside the provider adapter boundary.
- Clients must not receive more authority than required for their capability set.
- Audit events should identify the actor, capability, target, outcome and correlation context without recording secret material.

## Mobile and desktop

Secure storage is platform-specific and must be accessed through an adapter. A shared client library must not assume that a desktop filesystem primitive exists on iOS or Android.

## Gateway security

Gateway enrollment, key rotation, disablement and removal are security-sensitive lifecycle operations. They require authorization, auditability and post-change verification.

## Release requirement

Security documentation is not evidence of security. Security-sensitive capabilities become production claims only after the relevant implementation, tests, scanning and runtime verification gates pass.

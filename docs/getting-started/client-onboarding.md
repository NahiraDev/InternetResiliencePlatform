# Client Onboarding

This guide defines the product-level onboarding model for IRP clients. It does not prescribe a UI implementation.

## Client roles

IRP distinguishes:

- **Full client:** a device-side application capable of participating in the network-control lifecycle exposed by its platform integration.
- **Remote client:** a bounded API consumer used for status, diagnostics and explicitly permitted control-plane operations.
- **Gateway:** a network execution point that can provide an egress/path capability.
- **Regional probe:** a measurement node that produces signed network evidence.

A phone is not automatically a regional probe and should not receive probe credentials unless it is deliberately enrolled and independently validated for that role.

## Enrollment lifecycle

```text
Create device identity
        ↓
Issue enrollment credential
        ↓
Bind platform / capabilities
        ↓
Authenticate
        ↓
Issue short-lived access session
        ↓
Rotate refresh/session material
        ↓
Revoke when required
```

Device secrets and refresh material must use platform secure storage. They must never be placed in source control, logs, analytics or crash reports.

## Capability model

A client receives only the capabilities assigned to its identity. Read/diagnostic access must not imply network mutation. Administrative operations remain explicitly privileged.

## Reconnect

Clients must tolerate expired access tokens, temporary control-plane loss, gateway changes and server-side revocation. Reconnect must not silently broaden permissions.

## Mobile and desktop

The 70-phase product plan treats iOS, Android, Linux, macOS and Windows as client platforms. Native platform work is therefore a product implementation track, not a reason to duplicate the core resilience engine.

Platform-specific UI and networking adapters consume canonical control-plane contracts and must not create an independent routing or policy engine.

## Verification

A client integration is not complete until enrollment, authentication, capability enforcement, reconnect, revocation and failure-path behavior are tested on the target platform.

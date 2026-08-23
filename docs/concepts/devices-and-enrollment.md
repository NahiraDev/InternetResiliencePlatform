# Devices and Enrollment

A device is a managed IRP client identity. Enrollment binds a device to an account or installation authority and establishes the credentials and capabilities required to use the Control Plane.

## Lifecycle

```text
Unenrolled → Enrollment Requested → Authorized → Active
                                      ↓          ↓
                                   Rejected   Revoked/Disabled
```

Enrollment must be explicit, auditable, revocable, and scoped to the capabilities granted to the device.

## Multi-device model

A user may have multiple devices. Configuration synchronization must be deterministic and conflict-aware. Device-local state such as native network permissions remains platform-specific.

## Security

Long-lived secrets should not be exposed through ordinary UI state or logs. Device revocation must invalidate future authorization and be observable through the audit trail.

# Control Plane

The Control Plane is the authenticated coordination layer between IRP users, devices, gateways, policies, telemetry, and the network runtime.

## Responsibilities

- authenticate and authorize users and devices;
- expose versioned capability contracts;
- synchronize permitted configuration;
- maintain gateway and device inventory;
- expose telemetry and audit information;
- coordinate lifecycle operations without embedding platform-specific networking logic.

## Boundary

The Control Plane is not the data plane. It should not become a hidden second routing engine. Safety-critical decisions remain in the authoritative runtime and are exposed through explicit capabilities.

## Availability

Clients must degrade gracefully when the Control Plane is unavailable. Cached state may be displayed or used only where the capability contract explicitly permits it; stale authorization must not silently become permanent authorization.

# Phase 54 — Gateway Fleet Operations

## Status

Implementation started; verification required.

## Objective

Provide a provider-neutral fleet-operations layer for managed gateways without duplicating gateway inventory, health, selection, failover, or tunnel execution domains.

## Scope

Phase 54 adds deterministic fleet operations for:

- provisioning metadata and desired gateway state;
- upgrade intent and version tracking;
- safe drain and disable operations;
- bounded capacity management;
- maintenance scheduling metadata;
- operational audit events;
- defensive copies and invariant validation.

Actual cloud/VM provisioning and tunnel/network mutation remain adapters owned by higher layers. The fleet layer changes only canonical gateway registry lifecycle/metadata and fleet state.

## Safety guarantees

- Operations are explicit and idempotent where possible.
- Retired gateways cannot be returned to service through fleet operations.
- Draining gateways remain observable but are excluded from normal active provisioning targets.
- Disabling a gateway cannot silently change tunnel or route state.
- Capacity values are validated and bounded.
- Upgrade state is metadata until an external executor reports completion.
- Maintenance windows are metadata and do not trigger background jobs by themselves.
- Every mutation emits an operational event without secrets.
- Returned objects are defensive copies.

## Acceptance criteria

1. Fleet records can be created from existing `GatewayMetadata`.
2. Provisioning metadata can be recorded and updated without changing gateway identity.
3. Gateways can enter draining/disabled states through explicit fleet operations.
4. Capacity can be set/reserved/released without exceeding configured limits.
5. Upgrade intent can be scheduled and completed/failed explicitly.
6. Maintenance windows validate timestamps and support active-window checks.
7. Repeated idempotent lifecycle calls do not create inconsistent state.
8. Invalid states and capacity over-allocation are rejected deterministically.
9. Unit tests cover normal, boundary, invalid and failure behavior.
10. Repository validation, typecheck, lint, tests and build pass before completion.
11. `PROJECT_STATE.md` and architecture documentation remain truthful and do not mark the phase complete before CI verification.

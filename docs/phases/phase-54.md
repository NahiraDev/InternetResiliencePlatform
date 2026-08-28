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
- bounded capacity management, including reported allocation and reservations;
- maintenance scheduling metadata;
- operational audit events;
- defensive copies and invariant validation.

Actual cloud/VM provisioning and tunnel/network mutation remain adapters owned by higher layers. The fleet layer changes only canonical gateway registry lifecycle/metadata and fleet state.

## Safety guarantees

- Operations are explicit and idempotent where possible.
- Retired gateways cannot be returned to service through fleet operations.
- Draining gateways remain observable and may retain active/reserved capacity while workloads evacuate.
- A gateway cannot be disabled through the fleet API while capacity is allocated or reserved.
- Disabling a gateway cannot silently change tunnel or route state.
- Capacity values are validated and bounded.
- Upgrade state is metadata until an external executor reports completion.
- Maintenance windows are metadata and do not trigger background jobs by themselves.
- Every mutation emits an operational event without secrets.
- Returned objects are defensive copies.

## Acceptance criteria

1. Fleet records can be created from existing `GatewayMetadata`.
2. Provisioning metadata can be recorded and updated without changing gateway identity.
3. Gateways can enter active/draining/disabled states through explicit fleet operations.
4. Disable is rejected while allocated or reserved capacity is non-zero.
5. Capacity can be configured, reported as allocated, reserved and released without exceeding the configured limit.
6. Upgrade intent can be scheduled and completed/failed explicitly.
7. Maintenance windows validate timestamps and support active-window checks.
8. Repeated idempotent lifecycle calls do not create inconsistent state.
9. Invalid states, invalid timestamps and capacity over-allocation are rejected deterministically.
10. Unit tests cover normal, boundary, invalid and failure behavior.
11. Repository validation, typecheck, lint, tests and build pass before completion.
12. `PROJECT_STATE.md` and architecture documentation remain truthful and do not mark the phase complete before CI verification.

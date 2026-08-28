# Control Plane API Contract

This document defines the resource boundaries for the unified IRP control plane. It is a contract map, not a claim that every resource is already implemented.

## Contract status

Each API resource must be classified as `implemented`, `verified`, `pending-verification`, or `planned` against the current repository state.

## Resource domains

| Domain | Purpose | Current product track |
| --- | --- | --- |
| Authentication | Identity and sessions | Core / existing API |
| Devices | Enrollment, capability and revocation | Client platform |
| Runtime | Current resilience/autopilot state | Existing API |
| Probes | Regional measurement evidence | Federation |
| Analytics | Historical and aggregate network intelligence | Analytics |
| Gateways | Gateway inventory and health | Gateway |
| Tunnels | Transport lifecycle and health | Tunnel |
| Providers | Provider capabilities and lifecycle | Provider abstraction |
| Policies | Safety and network-control policy | Control plane |
| Telemetry | Metrics, events and diagnostics | Observability |
| Administration | RBAC, organizations and operational control | Control plane |
| Notifications | Alerts and client-facing events | Product UI |

## Phase 56 unified product boundary

The canonical client entry point is the versioned `/api/v1` surface. Phase 56 adds two discovery resources:

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /api/v1/product/capabilities` | None | Public version/capability manifest. |
| `GET /api/v1/product/context` | Bearer | Principal-specific capabilities authorized by the existing RBAC layer. |

The capability manifest declares operation kind, supported methods/paths, authentication mode, required permissions and implementation status. `product.context` filters that contract using the authenticated principal; it never grants a capability.

Clients may provide `X-API-Version: v1` or `Accept-Version: v1`. Unsupported versions fail with HTTP `406`, and successful Product API responses advertise `X-API-Version` and `X-API-Supported-Versions`.

## Contract principles

1. Authentication and authorization are separate concerns.
2. Resource mutation requires explicit capability and policy authorization.
3. Network-control operations must be auditable and idempotency/replay behavior must be defined where applicable.
4. Long-running operations need explicit state and failure semantics.
5. API responses must not expose bearer credentials, private keys or equivalent secrets.
6. Clients must not infer hidden policy from implementation details; the server contract is authoritative.
7. Product clients discover server-supported capabilities instead of assuming that roadmap resources are implemented.

## Client compatibility

Web, desktop and mobile clients consume the same control-plane contracts. Platform adapters may add native capabilities, but they must not fork the canonical policy or routing semantics.

## Evolution

Breaking changes require an ADR or equivalent contract decision, compatibility analysis, migration strategy and verification evidence. API additions should be backward-compatible by default.

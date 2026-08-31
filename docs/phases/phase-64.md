# Phase 64 — Shared Mobile Client Core

## Goal

Create the platform-neutral client core consumed by the iOS and Android Full Clients without moving routing, DNS, gateway, tunnel, failover, or safety authority into mobile code.

## Scope

- Shared mobile client state model for iOS and Android.
- Platform capability validation and deterministic initial state.
- Read-only diagnostics adapter contract.
- Explicit autonomous-mode state contract with no mutation authority.
- Immutable state snapshots for callers.
- Event subscription for policy, snapshot, and connection changes.
- Failure-safe refresh semantics: adapter failures leave client state unchanged.
- Runtime HTML endpoint resolution fix so the public runtime dashboard uses the colocated `/runtime-api` endpoint instead of assuming loopback.

## Security boundaries

The shared core is platform-neutral and must not execute shell commands, invoke privileged network APIs, mutate routes/firewalls, manage VPN tunnels, or bypass Core/Control Plane policy. Native capabilities remain behind platform adapters introduced in Phases 65–68.

The autonomous-mode flag is state only. It is not an authorization grant and must not directly trigger network mutations.

## Acceptance criteria

1. `@irp/core` exposes the shared mobile client core without platform-specific dependencies.
2. iOS and Android are the only accepted mobile platform identifiers.
3. State returned to callers cannot mutate internal policy state.
4. Adapter failures do not corrupt or partially update client state.
5. Diagnostics from one platform cannot be applied to another platform's client state.
6. Normal, boundary, invalid, and failure-path tests cover the shared contract.
7. The runtime dashboard resolves `/runtime-api` correctly when served by the Caddy/public runtime boundary and retains explicit `?api=` override support.
8. Repository validation, typecheck, lint, tests, and build remain green before phase closure.

## Definition of done

Phase 64 is **in progress** until the repository verification gate and the public runtime HTML verification evidence are green. Source implementation alone does not mark the phase complete.

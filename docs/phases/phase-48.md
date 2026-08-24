# Phase 48 — Secure Tunnel Abstraction

## Status

Implementation complete; CI verification is the completion gate.

## Objective

Harden the existing provider-neutral `@irp/tunnel` abstraction into the authoritative security boundary for later tunnel providers. Phase 48 does not select a vendor or implement a concrete tunnel backend.

## Scope

- Existing provider-neutral tunnel target, provider and lifecycle contracts.
- Provider capability negotiation before execution.
- Explicit lifecycle transition enforcement.
- Bounded operation timeout with `AbortSignal` propagation for cooperative providers.
- Provider endpoint, protocol, scope, routing-mode and capability validation.
- Health-evidence validation including timestamp freshness and internal consistency.
- Credential-reference-only handling; private credential material is not stored by the abstraction.
- Explicit failure/degraded semantics.
- No route, DNS, failover, gateway lifecycle or provider-specific command mutation.

## Authoritative package

`@irp/tunnel` is the canonical tunnel package. Gateway inventory remains owned by `@irp/gateway-registry`; tunnel execution contracts must not be duplicated there.

## Security boundaries

1. The abstraction does not generate, persist, log or inspect tunnel private keys.
2. Credential material is represented by references only.
3. Provider compatibility is checked before provider execution.
4. Endpoint, protocol, scope, routing mode and required capabilities must match the provider declaration.
5. Tunnel operations are bounded to 1–300 seconds and expose an `AbortSignal` for cooperative cancellation.
6. Health evidence rejects invalid/future timestamps and internally inconsistent healthy results.
7. Lifecycle transitions remain authoritative through the existing `transitionTunnel` state machine.
8. No provider-specific command execution is introduced in Phase 48.

## Verification matrix

- [x] Provider-neutral provider/lifecycle contract already present in `@irp/tunnel`.
- [x] Capability negotiation/security boundary added in `src/secure.ts`.
- [x] Bounded operation timeout added.
- [x] Provider compatibility validation added.
- [x] Health evidence validation added.
- [x] Dedicated Phase 48 tests added.
- [x] No new external dependencies.
- [ ] `pnpm validate` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] Workspace tests/build pass in CI.

## Explicit non-goals

Phase 48 does **not** implement a WireGuard adapter, OpenVPN adapter, additional provider adapter, gateway selection, automatic failover, routing mutation, key rotation, provisioning or provider-specific system commands. Those belong to later roadmap phases.

## Files

- `packages/tunnel/src/index.ts`
- `packages/tunnel/src/index.test.ts`
- `packages/tunnel/src/secure.ts`
- `packages/tunnel/src/secure.test.ts`
- `packages/tunnel/package.json`

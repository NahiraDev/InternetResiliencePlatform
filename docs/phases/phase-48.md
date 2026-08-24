# Phase 48 — Secure Tunnel Abstraction

## Status

Implementation complete; CI verification is the completion gate.

## Objective

Establish a provider-neutral, security-conscious tunnel lifecycle contract that later providers (Phase 49+) can implement without coupling the Core to WireGuard, OpenVPN, or another specific backend.

## Scope

- Provider-neutral tunnel target and capability contracts.
- Explicit tunnel lifecycle state machine.
- Connect/disconnect/reconnect/health-check manager operations.
- Provider capability negotiation before provider execution.
- Bounded operation timeouts.
- Defensive session copies.
- Opaque provider-owned connection context; secrets are not persisted by the abstraction.
- Explicit health state and degradation semantics.
- Failure reasons for failed lifecycle transitions.
- No route, DNS, failover, gateway lifecycle or policy mutation.

## Lifecycle

```text
disconnected → connecting → connected
                         ↘ failed
connected ↔ degraded
connected/degraded → disconnecting → disconnected
connected/degraded/failed → disconnecting → failed
failed → connecting
```

Invalid transitions are rejected. A failed operation does not silently become a successful state.

## Security boundaries

1. The abstraction does not generate, persist, log or inspect tunnel private keys.
2. Provider context is opaque and is passed only to the provider's `connect` operation.
3. Provider connections are represented by opaque handles and are kept separately from public session metadata.
4. Provider capabilities are checked before connection attempts.
5. Connect, disconnect and health-check operations have explicit hard timeouts.
6. Health evidence is validated before it becomes session state.
7. The abstraction is provider-neutral and contains no vendor-specific command execution.
8. The abstraction does not autonomously change routing or DNS.

## Acceptance criteria

- [x] Provider-neutral `TunnelProvider` contract.
- [x] Provider capability negotiation.
- [x] Explicit lifecycle state machine.
- [x] Connect/disconnect/reconnect operations.
- [x] Health-check operation with reachable/degraded semantics.
- [x] Hard timeout boundaries.
- [x] Defensive copies.
- [x] Opaque provider connection/context handling.
- [x] Invalid input and unsupported capability rejection.
- [x] Unit tests for normal, boundary and failure paths.
- [ ] `pnpm validate` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] Workspace tests/build pass in CI.

## Explicit non-goals

Phase 48 does **not** implement a WireGuard adapter, OpenVPN adapter, gateway selection, automatic failover, routing mutation, key rotation, provisioning or provider-specific system commands. Those concerns belong to later roadmap phases.

## Files

- `packages/gateway-registry/src/tunnel.ts`
- `packages/gateway-registry/src/tunnel.test.ts`
- `packages/gateway-registry/src/index.ts`

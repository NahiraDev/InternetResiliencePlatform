# Phase 46 — Gateway Registry

## Status

**Implementation:** complete on the phase branch.

**Verification:** pending CI. Do not mark the phase complete until repository validation, typecheck, lint, tests, build and the applicable runtime gates are green.

## Objective

Introduce the authoritative gateway inventory contract used by later gateway health, selection, tunnel and fleet phases. The registry stores gateway identity, ownership, endpoint metadata, declared capabilities, trust state, lifecycle state and operator metadata without performing network activation or routing decisions.

## Scope

- Gateway identity and stable IDs.
- Endpoint metadata and address-family declaration.
- Ownership and management source.
- Provider reference without provider-specific execution logic.
- Declared tunnel protocols, transports and capabilities.
- Lifecycle state machine: `registered → active → draining → disabled → retired` with bounded transitions.
- Trust state: `untrusted`, `pending`, `trusted`, `revoked`.
- Filtering by lifecycle, trust, region, country, provider, owner and tag.
- Metadata updates with identity/lifecycle preservation.
- Defensive copies to prevent external mutation of registry state.
- Safe retirement and deletion only after retirement.

## Non-goals

- Gateway discovery or health probing (Phase 47).
- Tunnel establishment or protocol implementation (Phases 48–50).
- Automatic gateway selection (Phase 51).
- Routing changes, DNS changes or failover execution.
- Secret or credential storage.
- Provider-specific network activation.

## Safety invariants

1. A gateway must have a stable ID, non-empty name, ownership and a valid endpoint port.
2. Endpoint metadata never contains credentials or private key material.
3. Duplicate IDs are rejected.
4. Registry reads and writes use defensive copies.
5. Lifecycle transitions are explicit and bounded; retired gateways cannot be reactivated.
6. Revoked trust cannot be silently restored; re-registration is required.
7. Only retired gateways may be removed from the registry.
8. Registry operations do not select, activate or mutate network paths.

## Acceptance tests

- Registration and lookup work and do not expose mutable internal state.
- Duplicate IDs are rejected.
- Invalid endpoint ports are rejected.
- Inventory filtering returns only matching gateways.
- Valid lifecycle transitions succeed and invalid transitions fail.
- Retirement records a retirement timestamp.
- Deletion before retirement fails.
- Revoked trust cannot be changed back to trusted/pending/untrusted.
- Metadata updates preserve gateway identity and lifecycle.

## Verification gate

Run from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm validate
pnpm validate:docs
pnpm lint
pnpm typecheck
pnpm test
pnpm exec turbo run test --force -- --coverage
pnpm build
pnpm examples:smoke
```

For pull requests, also run the repository Docker smoke test. Phase completion requires green CI and no new repository validation failures.

## Architectural boundary

The registry is an inventory/control-plane component. It must remain independent from tunnel execution and network decisioning. Later phases consume this contract rather than creating parallel gateway models.

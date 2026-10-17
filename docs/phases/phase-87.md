# Phase 87 — Multi-Interface Intelligence

## Status

**Contract formalized (issue #14).** Maps existing multi-interface representation already present in the connectivity fabric (`FabricResource` kinds `Interface`, `Link`, `Device`) and supporting packages `@irp/connectivity` / `@irp/network`. Disposition remains **PARTIAL** until CI evidence is recorded against this contract and the phase matrix is updated from evidence only. Net-new multi-interface intelligence beyond the mapped surface remains unauthorized until this contract is accepted and PROJECT_STATE is updated.

## Objective

Provide intelligence over multiple network interfaces on a device (Wi-Fi, Ethernet, cellular, VPN, etc.) so the control plane can observe, classify, score and select among them under policy and safety constraints. Multi-interface awareness is a consumer of the canonical fabric; it must not introduce a parallel resource model or mutation authority.

## Dependencies

- Phase 86 — Unified Connectivity Fabric
- Phase 78 — Closed-Loop Control Foundation
- Existing connectivity adapters and measurement primitives

## Canonical owner

- `@irp/resilience-runtime` — fabric model (`Interface` / `Link` kinds, freshness, diverse selection)
- Supporting: `@irp/connectivity`, `@irp/network`, `@irp/network-intelligence`
- Tests: fabric lifecycle / selection suites and connectivity package tests

## Scope

- Represent each physical or virtual interface as a typed fabric resource with health, capacity, cost and freshness.
- Support observation of interface state changes and link quality signals.
- Enable deterministic selection or ranking among interfaces for decision inputs.
- Preserve platform-specific interface enumeration behind existing adapters.

## Non-goals

- Direct mutation of interface configuration from this phase.
- Full multi-path bonding or application-aware routing (later phases).
- Production device evidence on real multi-interface hardware (issue #4).

## Acceptance criteria

1. Interfaces and links are modeled exclusively as `FabricResource` instances of the closed kind set; no competing interface registry exists.
2. Freshness and health evaluation produce deterministic results for multi-interface candidates.
3. Capability authority can restrict selectable interfaces by platform or trust.
4. Existing package tests that cover fabric resource lifecycle and selection pass.
5. Architecture guards continue to treat ResilienceRuntime as the sole production control-plane authority.

## Verification boundary

- Local package tests for `@irp/resilience-runtime` fabric suites and `@irp/connectivity`.
- CI workflows executing those suites.
- Explicit non-claim of production multi-interface certification.

## Rollback considerations

- Contract is documentation only; no runtime behavior change.
- Revert the phase document if later implementation diverges.

## Related issues

- Tracking: issue #14
- External blockers remain in issue #4

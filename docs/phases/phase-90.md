# Phase 90 — DNS / Tunnel / Proxy Orchestration Integration

## Status

**Contract formalized (issue #14).** Existing DNS, tunnel, and proxy packages plus fabric resource kinds provide foundational surfaces. Intelligent selection, health-aware ranking, and policy-gated activation remain **PARTIAL** pending exact-SHA CI evidence. Disposition **PARTIAL**.

## Objective

Integrate DNS, tunnel, and proxy selection and lifecycle into the unified connectivity fabric and decision orchestration so that they participate in the same observe-decide-apply-verify loop, without creating parallel orchestration authorities.

## Dependencies

- Phase 86 — Unified Connectivity Fabric
- Phase 89 — Gateway Intelligence & Selection
- Historical Phases 8, 15, 48–52 (DNS, tunnel abstraction, providers)
- Phase 75 — Decision Orchestration
- Phase 77 — Safety, Rollback & Recovery Kernel

## Canonical owner

- `@irp/resilience-runtime` — fabric kinds and orchestration for DNS/tunnel/proxy resources
- `@irp/dns`, `@irp/tunnel`, connectivity packages — domain-specific engines and adapters
- Consumed by fabric selection, closed-loop, and safety kernel
- Tests: existing DNS, tunnel, and fabric tests

## Scope

- Expose DNS resolvers, tunnels, and proxies as selectable, health-aware fabric resources with ownership and freshness.
- Allow decision orchestration to request DNS path changes, tunnel establish/teardown, or proxy selection through existing governance.
- Ensure all mutations remain privileged and pass the safety kernel; no direct side effects from selection.
- Preserve deterministic fallback when external control plane is unavailable.

## Non-goals

- New DNS engine, tunnel protocol, or proxy implementation.
- Automatic multi-protocol bonding without explicit policy.
- Production external-service validation or signed client evidence (issue #4).
- Predictive orchestration (later phases).

## Evidence map (this change)

| Criterion | Location |
|-----------|----------|
| Resolver (DNS) selection by health | `packages/resilience-runtime/tests/phase-90-dns-tunnel-proxy-regression.test.ts` |
| Stale Tunnel rejection | same |
| Proxy failure-domain diversity fail-closed | same |
| Inventory attributes (owner, failure domains, health) for Resolver/Tunnel/Proxy | same |
| Fabric Resolver/Tunnel/Proxy kinds | `packages/resilience-runtime/src/fabric.ts` |

## Acceptance criteria

1. DNS, tunnel, and proxy candidates appear in fabric snapshots with required attributes (id, health, capability, ownership).
2. Selection and request paths are deterministic and exclude stale or failed candidates.
3. Any establish, switch, or teardown request is routed through existing safety and authorization boundaries.
4. Unit tests covering resource exposure, selection constraints, and no-bypass of safety pass in owning packages.
5. Architecture guards continue to forbid competing orchestration authorities.

## Verification boundary

- Package unit tests for resilience-runtime, dns, and tunnel packages.
- Existing CI.
- No claim of live DNS/tunnel/proxy mutation evidence until runtime validation exists.

## Rollback considerations

- Documentation-only until implementation.
- Future integration must remain disableable and must not alter closed-loop stop conditions.

## Related issues

- Tracking: issue #14
- External blockers remain in issue #4

Disposition remains PARTIAL pending exact-SHA CI evidence on the owning package tests.

# Phase 91 — Application-Aware Path Selection

## Status

**Contract formalized (issue #14).** Existing fabric resource kind `ApplicationPath`, connectivity fabric selection, and decision orchestration provide foundational surfaces. Full application-aware path selection that consumes application identity, requirements, and observed path quality remains **PARTIAL** / **NOT STARTED** until this contract is accepted, PROJECT_STATE authorizes implementation, and evidence is produced. Disposition **PARTIAL** pending matrix update.

## Objective

Enable deterministic, policy-governed selection of connectivity paths that are aware of the requesting application or service, its latency/bandwidth/reliability requirements, and the health/freshness of candidate paths, without introducing a second selection or control-plane authority.

## Dependencies

- Phase 86 — Unified Connectivity Fabric
- Phase 88 — Multi-Path Connectivity Management
- Phase 89 — Gateway Intelligence & Selection
- Phase 90 — DNS / Tunnel / Proxy Orchestration Integration
- Phase 75 — Decision Orchestration
- Phase 77 — Safety, Rollback & Recovery Kernel
- Existing fabric resource kinds including `ApplicationPath`

## Canonical owner

- `@irp/resilience-runtime` — fabric selection, ApplicationPath resource handling, and decision orchestration integration
- Connectivity and routing packages — path graph and measurement inputs
- Consumed by closed-loop verification and safety kernel
- Tests: fabric tests, decision orchestration tests, and any new application-path selection tests in resilience-runtime

## Scope

- Represent application or service paths as first-class fabric resources with ownership, freshness, and capability constraints.
- Allow decision orchestration to request path selection that considers application identity and stated requirements (e.g., max latency, preferred failure domain).
- Ensure selection is deterministic, excludes stale/failed/blocked resources, and respects existing policy and safety boundaries.
- Any resulting path change or traffic steering request must pass the safety kernel and privileged mutation boundary.

## Non-goals

- Deep packet inspection or application protocol parsing beyond explicit identity hints.
- Automatic bonding or multipath TCP/QUIC without explicit policy and safety approval.
- Parallel path-selection authority outside resilience-runtime.
- Production application-specific validation or signed client evidence (issue #4).
- Predictive or ML-driven path ranking (later phases).

## Acceptance criteria

1. ApplicationPath resources can be registered, queried, and filtered by health, freshness, ownership, and capability attributes.
2. Path selection given an application identity and requirement constraints is deterministic and excludes ineligible candidates.
3. Selection results are advisory or governance-gated; no direct mutation of routing or fabric state occurs outside existing safety and authorization paths.
4. Unit tests covering resource registration, eligibility filtering, and constrained selection pass in the owning package.
5. Architecture guards continue to forbid a competing control-plane or selection authority.

## Verification boundary

- Package unit tests for `@irp/resilience-runtime` (fabric and decision orchestration).
- Existing CI that runs those suites.
- No claim of live application-aware traffic steering or multi-path validation until device/runtime evidence exists.

## Rollback considerations

- Documentation-only until implementation lands.
- Any future application-aware selection feature must be safe-by-default, disableable, and must not alter closed-loop stop conditions or fabric integrity when disabled.

## Related issues

- #14 — Define and authorize acceptance contracts for Master Roadmap V2 Groups B–L (Phases 84–150)

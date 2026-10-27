# Engineering Governance

## Purpose

This document defines engineering rules that keep IRP coherent across the historical 0–70 baseline and the current post-v1 roadmap through Phase 150.

## Canonical sources

- `PROJECT_STATE.md` — current implementation gate and handoff truth.
- `docs/roadmap/MASTER_ROADMAP_V2.md` — current post-70 product planning and phase dependencies.
- `docs/phases/` — current-phase implementation and audit records.
- `docs/audits/control-plane-execution-baseline-2026-09-03.md` — current control-plane ownership/gap baseline.
- `ROADMAP.md` — historical/v1 concise 0–70 roadmap reference.
- `docs/architecture/product-roadmap-70-phases.md` — historical/v1 detailed 0–70 phase contract.
- `docs/audits/phase-history-evidence-matrix.md` — historical implementation labels and evidence-backed mapping.
- `docs/documentation-standards.md` — documentation rules.
- `docs/release/production-assurance.md` — permanent executable system-integration gate.
- `ops/release/production-assurance.json` — machine-readable assurance contract.
- ADRs — durable architectural decisions.

Do not create competing canonical documents for the same fact.

## Change discipline

A contract or behavior change updates implementation, tests, and its canonical documentation in the same change set.

Before adding a package, service, abstraction, provider, or client capability, inspect existing code and contracts and reuse them where appropriate.

## Architecture boundaries

- Core/runtime owns network intelligence and authoritative autonomous decision orchestration.
- Control Plane exposes versioned capabilities, authorization and synchronization contracts.
- Clients consume capabilities; they do not duplicate routing, policy or resilience decision engines.
- Native platform adapters isolate OS-specific networking behavior.
- Gateway/tunnel providers are adapters behind common domain contracts.
- Analytics informs decisions but does not mutate network state directly.
- Domain-specific registries (DNS, gateway, tunnel, connectivity and plugins) are distinct owners; do not introduce an accidental generic competing registry.

## Control-plane ownership rule

The repository already contains substantial observation, state, intelligence, planning, policy, execution, assurance and recovery primitives. Phase 72–78 work must consolidate ownership around those components. Creating a second control-plane runtime or second decision engine is prohibited unless an ADR demonstrates why the existing owner cannot safely satisfy the contract.

## Phase completion

A phase is complete only when implementation, tests, documentation, runtime evidence where applicable, security review where applicable, and CI gates satisfy the phase contract.

For changes that affect runtime/control-plane behavior, **System Assurance must also pass**. The gate is executable: it builds the canonical resilience runtime, runs strict package integration, executes the canonical closed-loop scenarios, checks required stages/acceptance criteria, and records artifact integrity evidence.

System Assurance is not production certification. It proves repository/runtime integration only. Real regional, physical-device, production-infrastructure, recovery, security, release and soak evidence remains subject to the separate fail-closed production certification contract.

Source presence, exported types, mocks, placeholders, or documentation alone are never completion evidence.

## Historical phase numbering

Historical phase numbers are not authoritative current product identifiers. The repository has undergone roadmap revisions. Historical 0–70 material is retained as evidence and a v1 baseline; current post-v1 planning is authoritative in `docs/roadmap/MASTER_ROADMAP_V2.md`.

A historical implementation label may be mapped to a current phase only when source, tests, configuration/schema impact, ADRs or durable decisions, merged changes and applicable runtime/CI evidence support that mapping. Until then, it remains historical evidence only.

## Repository hygiene

- Prefer existing directories and documents over new top-level documentation.
- Keep current phase records under `docs/phases/`.
- Keep current architecture under `docs/architecture/`.
- Keep audit/reconstruction evidence under `docs/audits/`.
- Keep API contracts under `docs/api/`.
- Keep durable decisions under `docs/adr/`.
- Retire superseded documents instead of leaving parallel versions for the same authority.
- Keep internal links relative and valid.

## Security-sensitive changes

Routing, DNS, tunnel, gateway, authentication, authorization, device identity, key handling, and autonomous network mutation require explicit failure-path and rollback consideration.

## Product growth rule

New platform surfaces must use the shared capability model. A new client must not create a second source of truth for routing, policy, telemetry semantics, safety decisions or network-control authority.

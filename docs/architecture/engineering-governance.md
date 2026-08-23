# Engineering Governance

## Purpose

This document defines engineering rules that keep the 70-phase product coherent as the repository grows.

## Canonical sources

- `ROADMAP.md` — concise roadmap scope.
- `docs/architecture/product-roadmap-70-phases.md` — detailed phase contracts.
- `docs/architecture/product-architecture.md` — product-level architecture.
- `PROJECT_STATE.md` — current implementation truth.
- `docs/phases/` — current-phase implementation and audit records.
- `docs/audits/phase-history-evidence-matrix.md` — historical implementation labels and their evidence-backed mapping status.
- `docs/documentation-standards.md` — documentation rules.
- ADRs — durable architectural decisions.

Do not create competing canonical documents for the same fact.

## Change discipline

A contract or behavior change updates implementation, tests, and its canonical documentation in the same change set.

Before adding a package, service, abstraction, provider, or client capability, inspect existing code and contracts and reuse them where appropriate.

## Architecture boundaries

- Core owns network intelligence and autonomous decision authority.
- Control Plane exposes versioned capabilities and authorization.
- Clients consume capabilities; they do not duplicate decision engines.
- Native platform adapters isolate OS-specific networking behavior.
- Gateway/tunnel providers are adapters behind common contracts.
- Analytics informs decisions but does not mutate network state directly.

## Phase completion

A phase is complete only when implementation, tests, documentation, runtime evidence where applicable, security review where applicable, and CI gates satisfy the phase contract.

Source presence, exported types, mocks, placeholders, or documentation alone are never completion evidence.

## Historical phase numbering

Historical phase numbers are **not** authoritative product identifiers. The repository has undergone roadmap revisions, so a historical label such as "Phase 8" must never be assumed to mean current product Phase 8.

Historical implementation claims must be kept separate from current product-phase status. A mapping from historical work to a current phase requires evidence from implementation ownership, tests, configuration/schema impact, ADRs or durable decisions, merged changes, and applicable runtime/CI evidence. Until that mapping is justified, the historical item remains evidence only and must not advance the current phase status.

The canonical mapping status is maintained in [`../audits/phase-history-evidence-matrix.md`](../audits/phase-history-evidence-matrix.md).

## Repository hygiene

- Prefer existing directories and documents over new top-level documentation.
- Keep current phase records under `docs/phases/`.
- Keep historical mapping/reconstruction under `docs/audits/`.
- Keep architecture under `docs/architecture/`.
- Keep API contracts under `docs/api/`.
- Keep durable decisions under `docs/adr/`.
- Retire superseded documents instead of leaving parallel versions.
- Keep internal links relative and valid.

## Security-sensitive changes

Routing, DNS, tunnel, gateway, authentication, authorization, device identity, key handling, and autonomous network mutation require explicit failure-path and rollback consideration.

## Product growth rule

New platform surfaces must use the shared capability model. A new client must not create a second source of truth for routing, policy, telemetry semantics, or safety decisions.

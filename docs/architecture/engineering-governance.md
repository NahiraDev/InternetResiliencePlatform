# Engineering Governance

## Purpose

This document defines engineering rules that keep the 70-phase product coherent as the repository grows.

## Canonical sources

- `ROADMAP.md` — concise roadmap scope.
- `docs/architecture/product-roadmap-70-phases.md` — detailed phase contracts.
- `docs/architecture/product-architecture.md` — product-level architecture.
- `PROJECT_STATE.md` — current implementation truth.
- `docs/phases/` — historical implementation and audit evidence.
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

## Repository hygiene

- Prefer existing directories and documents over new top-level documentation.
- Keep phase evidence under `docs/phases/`.
- Keep architecture under `docs/architecture/`.
- Keep API contracts under `docs/api/`.
- Keep durable decisions under `docs/adr/`.
- Retire superseded documents instead of leaving parallel versions.
- Keep internal links relative and valid.

## Security-sensitive changes

Routing, DNS, tunnel, gateway, authentication, authorization, device identity, key handling, and autonomous network mutation require explicit failure-path and rollback consideration.

## Product growth rule

New platform surfaces must use the shared capability model. A new client must not create a second source of truth for routing, policy, telemetry semantics, or safety decisions.

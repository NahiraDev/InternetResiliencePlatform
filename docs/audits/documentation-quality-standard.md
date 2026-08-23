# IRP Documentation Quality Standard

**Status:** canonical governance policy
**Scope:** every durable Markdown/MDX document in the repository and every project surface that links to documentation.

## Quality bar

A document is production-grade only when a reader can determine what the component is, why it exists, how to use it, what it depends on, what it guarantees, how it fails, how it is secured, how it is observed, how it is tested, and where implementation truth lives.

A document must also be explicit about status:

- **Verified:** implemented and supported by current verification evidence.
- **Implemented / verification pending:** source and tests exist, but the required release gate is still open.
- **Historical:** records past implementation without defining current behavior.
- **Planned:** roadmap/specification only.
- **Deprecated:** retained only to point readers toward its replacement.

## Canonical ownership

Each durable fact has one canonical document. Duplicate summaries are allowed only when they are navigation aids and link immediately to the canonical source.

- Product roadmap → `docs/architecture/product-roadmap-70-phases.md`
- Product architecture → `docs/architecture/product-architecture.md`
- API contracts → `docs/api/`
- Security architecture → `docs/security/`
- Operational procedures → `docs/operations/`
- User procedures → `docs/guides/` and `docs/getting-started/`
- Concepts and terminology → `docs/concepts/`
- Architectural decisions → `docs/adr/`
- Historical phase evidence → `docs/phases/` and `docs/audits/phase-history-evidence-matrix.md`

## Required structure by document type

### Concept

Define the term, purpose, boundaries, relationships to adjacent concepts, and authoritative references. Do not prescribe implementation details unless they are essential to the concept.

### Architecture

Cover responsibilities, dependencies, trust boundaries, control/data flow, state lifecycle, failure behavior, observability, security, implementation references, and known limitations.

### API reference

Define authentication, authorization, request/response contracts, validation, error semantics, idempotency where applicable, rate/resource limits, versioning, and examples. Planned endpoints must be explicitly marked planned.

### Guide

State prerequisites, exact steps, expected result, rollback/recovery where relevant, and troubleshooting notes. Commands must be safe and reproducible.

### Operations

Define deployment/upgrade procedure, health signals, failure modes, recovery, backup/restore, rollback, secrets, ownership and verification commands.

### Phase record

Record objective, status, scope, implementation evidence, tests, runtime/CI evidence, acceptance criteria, known gaps, and references. A phase record must never redefine architecture or API contracts.

### Historical evidence

Separate historical implementation numbering from the current 70-phase product contract. Never infer current completion from a historical phase number or commit subject alone.

## Cross-document consistency

When a durable behavior or contract changes, update in the same change set:

1. implementation;
2. tests;
3. canonical documentation;
4. `PROJECT_STATE.md` when implementation status changes;
5. phase record/evidence when the change belongs to a tracked phase.

## Link integrity

Use repository-relative links. Links must resolve from the document containing them. External links are allowed only when they add material value and are not required to understand an internal contract.

## Anti-patterns

Do not create:

- a new top-level document for an existing concept;
- a phase report that merely repeats the roadmap;
- speculative implementation documentation for a future phase;
- a second API contract for the same route;
- architecture documentation that claims behavior unsupported by code/tests;
- temporary logs, generated verification dumps, or personal notes in canonical documentation paths.

## Review checklist

Before merging documentation changes, verify:

- canonical owner is clear;
- status is explicit;
- claims match implementation;
- examples and commands are reproducible;
- failure/security behavior is covered where relevant;
- internal links resolve;
- the documentation validator passes;
- no stale architecture/roadmap terminology was introduced.

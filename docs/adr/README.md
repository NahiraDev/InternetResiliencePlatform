# Architecture Decision Records

ADRs capture durable architectural decisions whose rationale is important to future maintainers.

## When to write an ADR

Create an ADR when a decision:

- changes a system boundary;
- introduces a durable architectural constraint;
- selects between meaningful alternatives;
- changes a security or trust boundary;
- changes persistence, event, provider, or runtime architecture;
- would otherwise be repeatedly rediscovered in design discussions.

Do not use ADRs for routine implementation tasks, phase reports, bug fixes, or temporary experiments.

## Current records

- [ADR-0001: Repository architecture](0001-repository-architecture.md)
- [ADR-0002: Phase 4 Core Platform Foundation](0002-phase-4-core-platform.md)
- [ADR-0003: Phase 6 Network Intelligence Core](0003-phase-6-network-intelligence.md)
- [ADR template](template.md)

Historical ADR names may retain phase references for traceability. The decision itself should remain useful independently of the phase in which it was made.

## Required structure

```text
Title
Status
Context
Decision
Alternatives considered
Consequences
Implementation / verification references
```

Accepted ADRs describe decisions, not current implementation status. If implementation later diverges, update the ADR status or add a superseding ADR rather than silently rewriting the historical decision.

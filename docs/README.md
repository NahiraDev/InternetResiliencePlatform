# Documentation

This directory is the canonical documentation tree for InternetResiliencePlatform. It is organized by purpose, not by temporary phase output.

## Start here

### External developer

1. [Quick start](getting-started/quick-start.md)
2. [Platform support](getting-started/platform-support.md)
3. [Development](development.md)
4. [Configuration](configuration.md)
5. [Current architecture](current-architecture.md)
6. [API reference](api/platform-status-api.md)
7. [Examples](../examples/README.md)

### Maintainer / architect

1. [Architecture](architecture/README.md)
2. [Platform model](architecture/platform-model.md)
3. [Data and control flow](architecture/data-flow.md)
4. [70-phase product plan](architecture/product-roadmap-70-phases.md)
5. [Engineering governance](architecture/engineering-governance.md)
6. [Release gates](architecture/release-gates.md)
7. [Phase records](phases/README.md)
8. [ADRs](adr/)

### Operator / troubleshooter

- [Guides](guides/)
- [Troubleshooting](guides/troubleshooting.md)
- [Operations](operations/)
- [Deployment model](operations/deployment-model.md)
- [Recovery and rollback](operations/recovery.md)
- [Autopilot runbook](operations/autopilot-runbook.md)
- [Observability](observability.md)
- [Security architecture](security-architecture.md)
- [Reference](reference/)

## Core concepts

- [Autopilot](concepts/autopilot.md)
- [Control loop](concepts/control-loop.md)

## Documentation structure

| Section | Purpose |
| --- | --- |
| Root guides | Stable user-facing entry points retained for compatibility |
| `getting-started/` | Installation, platform support and first-run workflows |
| `concepts/` | Durable product concepts and terminology |
| `api/` | API contracts and examples |
| `architecture/` | Current architecture, product model, governance and release rules |
| `network/` | Network-specific concepts and boundaries |
| `guides/` | Task-oriented procedures and troubleshooting |
| `operations/` | Deployment, recovery and operational procedures |
| `reference/` | Stable package and implementation references |
| `security/` | Security-specific documentation |
| `adr/` | Durable architectural decisions |
| `phases/` | Historical implementation and audit evidence |

## Canonical-source rules

- One fact has one canonical home.
- Prefer updating an existing canonical document over creating a duplicate.
- Architecture belongs in `architecture/`; phase evidence belongs in `phases/`; API contracts belong in `api/`; durable decisions belong in `adr/`.
- Concepts belong in `concepts/`; operational procedures belong in `operations/`; troubleshooting belongs in `guides/`.
- Do not create one-off phase reports in the user-facing navigation.
- Phase records distinguish implemented, verified, pending-verification, and planned behavior.
- Use relative links and keep them valid.
- When implementation changes a contract, update implementation, tests, and the canonical document together.

## Project authority

- Project overview: [`../README.md`](../README.md)
- Concise roadmap: [`../ROADMAP.md`](../ROADMAP.md)
- Detailed 70-phase plan: [`architecture/product-roadmap-70-phases.md`](architecture/product-roadmap-70-phases.md)
- Product architecture: [`architecture/product-architecture.md`](architecture/product-architecture.md)
- Current implementation state: [`../PROJECT_STATE.md`](../PROJECT_STATE.md)
- Documentation standards: [`documentation-standards.md`](documentation-standards.md)

If sources disagree, implementation and verification must be reconciled before a capability is described as production-ready.

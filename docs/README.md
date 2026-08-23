# Documentation

This directory is the canonical documentation tree for InternetResiliencePlatform. It is intentionally organized by document purpose rather than by temporary phase output.

## Start here

### External developer

1. [Quick start](getting-started/quick-start.md)
2. [Development](development.md)
3. [Configuration](configuration.md)
4. [Current architecture](current-architecture.md)
5. [API reference](api/platform-status-api.md)
6. [Examples](../examples/README.md)

### Maintainer / architect

1. [Architecture](architecture/README.md)
2. [70-phase product plan](architecture/product-roadmap-70-phases.md)
3. [Engineering governance](architecture/engineering-governance.md)
4. [Release gates](architecture/release-gates.md)
5. [Phase records](phases/README.md)
6. [ADRs](adr/)

### Operator / troubleshooter

- [Guides](guides/)
- [Operations](operations/)
- [Observability](observability.md)
- [Security](security-architecture.md)
- [Reference](reference/)

## Documentation structure

| Section | Purpose |
| --- | --- |
| Root guides | Stable user-facing entry points |
| `getting-started/` | Installation and first-run workflows |
| `api/` | API contracts and examples |
| `architecture/` | Current architecture, product architecture, governance and release rules |
| `guides/` | Task-oriented procedures and troubleshooting |
| `operations/` | Deployment and operational procedures |
| `reference/` | Stable package and implementation references |
| `security/` | Security-specific documentation |
| `adr/` | Durable architectural decisions |
| `phases/` | Historical implementation and audit evidence |

## Canonical-source rules

- One fact has one canonical home.
- Prefer updating an existing canonical document over creating a duplicate.
- Architecture belongs in `architecture/`; phase evidence belongs in `phases/`; API contracts belong in `api/`; durable decisions belong in `adr/`.
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

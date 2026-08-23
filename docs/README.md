# Documentation

This directory is the canonical documentation tree for InternetResiliencePlatform. It is organized by purpose, not by temporary phase output.

## Start here

### External developer

1. [Quick start](getting-started/quick-start.md)
2. [Platform support](getting-started/platform-support.md)
3. [Client onboarding](getting-started/client-onboarding.md)
4. [Development](development.md)
5. [Configuration](configuration.md)
6. [Current architecture](current-architecture.md)
7. [API reference](api/platform-status-api.md)
8. [Examples](../examples/README.md)

### Maintainer / architect

1. [Architecture](architecture/README.md)
2. [Platform model](architecture/platform-model.md)
3. [Product architecture](architecture/product-architecture.md)
4. [Data and control flow](architecture/data-flow.md)
5. [Gateway and tunnel architecture](architecture/gateway-and-tunnel-architecture.md)
6. [70-phase product plan](architecture/product-roadmap-70-phases.md)
7. [Engineering governance](architecture/engineering-governance.md)
8. [Release gates](architecture/release-gates.md)
9. [Phase records](phases/README.md)
10. [Historical phase evidence matrix](audits/phase-history-evidence-matrix.md)
11. [Documentation audit](audits/documentation-audit-2026-08-23.md)
12. [ADRs](adr/)

### Operator / troubleshooter

- [Guides](guides/)
- [Troubleshooting](guides/troubleshooting.md)
- [Operations](operations/)
- [Deployment model](operations/deployment-model.md)
- [Recovery and rollback](operations/recovery.md)
- [Autopilot runbook](operations/autopilot-runbook.md)
- [Observability](observability.md)
- [Security](security/)
- [Security architecture](security/security-architecture.md)
- [Reference](reference/)

## Core concepts

- [Autopilot](concepts/autopilot.md)
- [Control loop](concepts/control-loop.md)
- [Network Autopilot](concepts/network-autopilot.md)
- [Full Client Model](concepts/full-client-model.md)
- [Gateways and Tunnels](concepts/gateways-and-tunnels.md)
- [Devices and Enrollment](concepts/devices-and-enrollment.md)
- [Telemetry and Analytics](concepts/telemetry-and-analytics.md)
- [Extensibility](concepts/extensibility.md)

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
| `audits/` | Documentation/repository audit records and migration evidence |
| `testing/` | Test policy and exception metadata |

## Canonical-source rules

- One fact has one canonical home.
- Prefer updating an existing canonical document over creating a duplicate.
- Architecture belongs in `architecture/`; phase evidence belongs in `phases/`; API contracts belong in `api/`; durable decisions belong in `adr/`.
- Concepts belong in `concepts/`; operational procedures belong in `operations/`; troubleshooting belongs in `guides/`.
- Security architecture belongs in `security/`.
- Historical implementation mappings belong in `audits/phase-history-evidence-matrix.md`; they do not redefine the current roadmap.
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
- Documentation audit baseline: [`audits/documentation-audit-2026-08-23.md`](audits/documentation-audit-2026-08-23.md)
- Historical phase evidence matrix: [`audits/phase-history-evidence-matrix.md`](audits/phase-history-evidence-matrix.md)

If sources disagree, implementation and verification must be reconciled before a capability is described as production-ready.

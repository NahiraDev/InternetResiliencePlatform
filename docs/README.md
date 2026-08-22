# Documentation

This directory contains the canonical user-facing and maintainer documentation for InternetResiliencePlatform.

## Start here

Choose the path that matches your task:

### External developer

1. [Quick start](getting-started/quick-start.md) — install and run the repository.
2. [Development](development.md) — development workflow, checks, and tooling.
3. [Configuration](configuration.md) — local and runtime configuration.
4. [Current architecture](current-architecture.md) — implemented system and boundaries.
5. [API reference](api/platform-status-api.md) — documented HTTP and streaming API.
6. [Examples](../examples/README.md) — runnable capability-oriented examples.

### Maintainer / operator

- [Architecture](architecture/README.md) — detailed subsystem architecture.
- [Guides](guides/) — testing and troubleshooting procedures.
- [Operations](operations/) — deployment and runtime procedures.
- [Observability](observability.md) — metrics, telemetry, diagnostics, and operational visibility.
- [Security](security-architecture.md) — authentication, authorization, trust boundaries, and security invariants.
- [Reference](reference/) — package and implementation reference material.
- [ADRs](adr/) — accepted architectural decisions.
- [Phase records](phases/) — historical implementation records.

## Documentation structure

| Section | Purpose | Audience |
| --- | --- | --- |
| Root guides | Stable user-facing documentation | Everyone |
| `api/` | API contracts and examples | API consumers / developers |
| `architecture/` | Detailed implementation architecture | Maintainers / architects |
| `development/` | Local development and tooling | Developers |
| `guides/` | Task-oriented testing and troubleshooting | Developers / operators |
| `operations/` | Deployment and operational procedures | Operators / maintainers |
| `reference/` | Stable package and implementation reference | Developers / maintainers |
| `security/` | Security-specific implementation/reference material | Developers / security reviewers |
| `adr/` | Accepted architectural decisions | Maintainers / architects |
| `phases/` | Historical implementation record | Maintainers / auditors |

## Documentation rules

- Prefer updating an existing canonical document over creating a new document for the same concept.
- Root documents must remain stable, current, and useful to an external developer.
- Do not put phase reports, generated output, audit dumps, temporary JSON, or one-off verification notes in the user-facing navigation.
- Phase documents are historical records, not product documentation.
- Describe only behavior that exists and is verifiable on `main`. Mark planned behavior explicitly.
- Avoid duplicating the same architecture, API contract, or operational procedure in multiple files.
- Keep links relative and maintainable; repository validation checks internal Markdown targets.
- Use task-oriented documents for procedures and reference documents for stable facts/contracts.

## Project authority

- Project overview: [`../README.md`](../README.md)
- Roadmap: [`../ROADMAP.md`](../ROADMAP.md)
- Current implementation state: [`../PROJECT_STATE.md`](../PROJECT_STATE.md)
- Documentation index: this file

If these sources disagree, implementation and verification must be reconciled before claiming a capability is production-ready.

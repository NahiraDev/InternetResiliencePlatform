# Documentation

This directory is the user-facing documentation for InternetResiliencePlatform.

## Start here

New to the project? Follow this path:

1. [Development](development.md) — install, run, test, lint, and build the repository.
2. [Configuration](configuration.md) — configure local and runtime environments.
3. [Architecture](current-architecture.md) — understand the implemented system and its boundaries.
4. [API reference](api/platform-status-api.md) — inspect the documented HTTP and streaming API.
5. [Docker](development/docker.md) — run the supported containerized development/runtime setup.
6. [Observability](observability.md) — metrics, telemetry, diagnostics, and operational visibility.
7. [Security](security-architecture.md) — authentication, authorization, trust boundaries, and security invariants.

## Documentation structure

| Section | Purpose | Audience |
| --- | --- | --- |
| Root guides | Stable, user-facing documentation | Everyone |
| `api/` | API contracts and examples | API consumers / developers |
| `architecture/` | Detailed implementation architecture | Maintainers / architects |
| `development/` | Local development and tooling | Developers |
| `operations/` | Deployment and operational procedures | Operators / maintainers |
| `security/` | Security-specific implementation/reference material | Developers / security reviewers |
| `adr/` | Accepted architectural decisions | Maintainers / architects |
| `phases/` | Historical implementation record | Maintainers / auditors |

## Documentation rules

- Prefer updating an existing canonical document over creating a new document.
- Root documents must remain stable, current, and useful to an external developer.
- Do not put phase reports, generated output, audit dumps, temporary JSON, or one-off verification notes in the user-facing navigation.
- Phase documents are historical records, not product documentation.
- Describe only behavior that exists and is verifiable on `main`. Mark planned behavior explicitly.
- Avoid duplicating the same architecture or API contract in multiple files.
- Keep links relative and verify them when moving or removing documents.

## Project authority

- Project overview: [`../README.md`](../README.md)
- Roadmap: [`../ROADMAP.md`](../ROADMAP.md)
- Current implementation state: [`../PROJECT_STATE.md`](../PROJECT_STATE.md)
- Documentation index: this file

If these sources disagree, implementation and verification must be reconciled before claiming a capability is production-ready.

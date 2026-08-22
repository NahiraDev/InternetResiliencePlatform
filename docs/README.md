# InternetResiliencePlatform Documentation

This is the documentation entry point for developers and operators using the project from the outside.

## Start here

If this is your first time with the repository, follow this order:

1. **[Development](development.md)** — install dependencies, run checks, and start the project.
2. **[Configuration](configuration.md)** — understand runtime configuration and environment overrides.
3. **[Current architecture](current-architecture.md)** — understand what is implemented on `main` and where the major components live.
4. **[API reference](api/platform-status-api.md)** — inspect the currently documented platform API surface.
5. **[Docker development](development/docker.md)** — run the project with Docker and troubleshoot container-specific issues.
6. **[Observability](observability.md)** — metrics, telemetry, diagnostics, and operational visibility.
7. **[Security architecture](security-architecture.md)** — authentication, authorization, trust boundaries, and security invariants.
8. **[Regional validation](regional-validation.md)** — optional regional-vantage validation and evidence requirements.

## Documentation map

| Area | Canonical location | Audience |
| --- | --- | --- |
| Getting started / development | `development.md` | Developers |
| Configuration | `configuration.md` | Developers / Operators |
| Architecture | `current-architecture.md` | Developers / Architects |
| API | `api/` | API consumers |
| Runtime architecture details | `architecture/` | Maintainers |
| Docker / operations | `development/`, `operations/` | Developers / Operators |
| Security | `security-architecture.md`, `security/` | Developers / Operators |
| Observability | `observability.md` | Developers / Operators |
| Architectural decisions | `adr/` | Maintainers |
| Phase history | `phases/` | Maintainers / Auditors |

## Rules for documentation

- Root-level documents are user-facing canonical guides. Avoid creating another root document for a narrow implementation detail.
- Phase reports are historical records and must not be used as onboarding documentation.
- Generated reports, audit dumps, temporary JSON results, and one-off verification notes do not belong in the canonical documentation tree.
- Architecture documents describe code that exists on `main`; proposed work belongs in the roadmap or an ADR.
- `README.md`, `ROADMAP.md`, `PROJECT_STATE.md`, and this directory must agree on the current project state.

## Project state

The authoritative roadmap is [`../ROADMAP.md`](../ROADMAP.md). Current implementation status is tracked in [`../PROJECT_STATE.md`](../PROJECT_STATE.md).

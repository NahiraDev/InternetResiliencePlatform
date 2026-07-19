# Internet Resilience Platform

The Internet Resilience Platform is an open source foundation for measuring, modeling, and improving the reliability of Internet-facing systems. The repository starts with governance, documentation, automation, and development conventions that make future implementation work predictable and auditable.

## Goals

- Establish a secure, maintainable project structure.
- Document architectural decisions before implementation details harden.
- Provide consistent scripts for local bootstrap, linting, and tests.
- Use GitHub automation for repeatable validation.

## Repository layout

```text
.github/              GitHub templates, Dependabot, and workflow automation
docs/                 Architecture, ADRs, security, development, and network docs
scripts/              Local development helper scripts
```

## Getting started

```bash
./scripts/bootstrap.sh
./scripts/lint.sh
./scripts/test.sh
```

Phase 0 intentionally uses placeholder validation so the repository can evolve safely as application code is introduced.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening issues or pull requests.

## Security

Report suspected vulnerabilities using the process in [SECURITY.md](SECURITY.md).

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).

## Phase 5 Core Backend

Phase 5 introduces the production backend foundation under `/api/v1`: authentication with HMAC JWT access and refresh tokens, RBAC permissions, session lifecycle endpoints, standardized success/error responses, pagination metadata, health/readiness/metrics endpoints, and core user, organization, project, and workspace APIs.

The database model is defined in `packages/database/prisma/schema.prisma` and includes users, organizations, projects, workspaces, memberships, roles, permissions, sessions, tokens, audit logs, outbox events, and cache entries with UUID primary keys, timestamps, constraints, foreign keys, indexes, and soft-delete columns where lifecycle deletion is required.

Run the core checks with:

```bash
pnpm build
pnpm --filter @irp/api test
```

## Phase 6 Network Intelligence Core

Phase 6 adds a measurement-only network intelligence subsystem. It does not install VPNs, proxies, censorship bypass components, or traffic interception hooks. The core runs modular TypeScript probes for DNS latency, TCP latency, HTTP availability, packet-loss estimation, connection stability, basic throughput estimation, IPv4/IPv6 availability, and locally available provider information.

Operational surfaces:

- API: `GET /api/v1/health/network`, `GET /api/v1/metrics/network`, `GET /api/v1/measurements`, and `POST /api/v1/probes/run`.
- CLI: `irp network check` prints DNS status, latency, connectivity score, and detected issues.
- Telemetry: Prometheus metrics include `probe_success_total`, `probe_failure_total`, `network_latency_ms`, and `network_health_score`.

Probe implementations live in `@irp/network` behind a plugin contract so future probes can be added without changing API or CLI callers.

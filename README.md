# Internet Resilience Platform

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E=24-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11.21.0-F69220.svg?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-000000.svg)](https://turborepo.com/)
[![Docker](https://img.shields.io/badge/Docker-supported-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com/)

**Internet Resilience Platform (IRP)** is an open-source TypeScript monorepo for measuring, diagnosing, and progressively automating recovery from unreliable network conditions.

The product target is a policy-controlled Network Autopilot with one authoritative Core/Control Plane and full-capability clients across **Linux, macOS, Windows, iOS and Android**. Web is the unified control surface; Mobile is a Full Client, not a dashboard-only viewer.

The governed loop is:

```text
Observe → Measure → Detect → Diagnose → Decide
        → Policy / Safety Check → Plan → Apply
        → Verify → Monitor → Failover / Recovery
        → Learn → Explain
```

## Current implementation truth

The repository is under active development. The roadmap contains **70 phases**, but the project is not 70 phases complete. Current implementation work is in the Phase 43/44 federation and analytics area, with final verification gates still required. A capability is not considered production-ready merely because source code exists; it must pass the applicable validation, test, build, runtime, security, and integration gates.

## Product roadmap

The 70 phases are organized into these tracks:

- **0–7:** Foundation & Engineering
- **8–18:** Network Intelligence & Resilience
- **19–27:** Extensibility & Access Providers
- **28–38:** Learning, Analytics & Observability
- **39–45:** Secure Client & Distributed Evidence
- **46–55:** Gateway, Tunnel & Multi-Path Platform
- **56–60:** Unified Control Plane & Product UI
- **61–63:** Linux/macOS/Windows Full Clients
- **64–68:** iOS/Android Full Clients and native networking
- **69–70:** Production Hardening & v1.0 Certification

See [`ROADMAP.md`](ROADMAP.md) for the concise roadmap and [`docs/PRODUCT_ROADMAP_70_PHASES.md`](docs/PRODUCT_ROADMAP_70_PHASES.md) for dependencies, acceptance contracts and release gates.

## What exists today

The current repository includes:

- Network and DNS measurement primitives
- DNS diagnostics and connectivity inspection
- Deterministic network decisioning primitives
- Candidate scoring, policy/security gates, confidence, replay, and audit support
- Failover and Autopilot simulations with explicit host-network safety boundaries
- API, CLI, resilience-runtime, observability, and plugin-oriented packages
- Distributed probe federation and signed evidence capabilities
- Data analytics primitives over historical/federated evidence
- Docker production/runtime smoke validation
- Repository integrity validation and CI enforcement

The long-term goal is to evaluate degradation, choose an authorized recovery path, verify the result, recover safely when an action is ineffective, and expose the same capability model to every supported client.

## Start here

### For users and external developers

1. [Getting started](docs/getting-started/quick-start.md)
2. [Development guide](docs/development.md)
3. [Configuration](docs/configuration.md)
4. [Current architecture](docs/current-architecture.md)
5. [API reference](docs/api/platform-status-api.md)
6. [Examples](examples/README.md)
7. [Observability](docs/observability.md)
8. [Security architecture](docs/security-architecture.md)

### For maintainers

- [Documentation index](docs/README.md)
- [Architecture documentation](docs/architecture/README.md)
- [Product architecture](docs/PRODUCT_ARCHITECTURE.md)
- [70-phase product plan](docs/PRODUCT_ROADMAP_70_PHASES.md)
- [Operational documentation](docs/operations/)
- [Architectural decisions](docs/adr/)
- [Testing policy](docs/testing/)
- [Current project state](PROJECT_STATE.md)
- [Roadmap](ROADMAP.md)

Phase records live under [`docs/phases/`](docs/phases/) and are implementation/audit records rather than the product roadmap.

## Quick start

Requirements:

- Node.js 24+
- pnpm 11.21+
- Docker for container/runtime validation

From the repository root:

```bash
pnpm install
pnpm validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm examples:smoke
```

The deterministic smoke suite runs local examples and does not mutate host networking. API examples require the normal API service to be running; see [`examples/README.md`](examples/README.md).

## Repository layout

```text
apps/                 Application entry points
packages/             Reusable IRP packages
examples/             Capability-oriented runnable examples
docs/                 User-facing and maintainer documentation
scripts/              Validation, smoke tests, and operational tooling
.github/workflows/    CI, security, Docker, and validation workflows
```

IRP uses pnpm workspaces and Turborepo. The root `package.json` and workspace manifests are the canonical source for package and tooling boundaries.

## Architecture

At a high level:

```text
                 IRP Core / Control Plane
                           │
             ┌─────────────┼─────────────┐
             │             │             │
           Web          Desktop        Mobile
             │             │             │
             └─────────────┼─────────────┘
                           │
                  Shared capabilities
                           │
             Measurement / Intelligence
                           │
               Policy / Safety / Audit
                           │
             Recovery / Failover / Tunnel
                           │
                  Verification / Rollback
                           │
                    Telemetry / History
```

Detailed architecture is documented in [`docs/architecture/`](docs/architecture/) and [`docs/PRODUCT_ARCHITECTURE.md`](docs/PRODUCT_ARCHITECTURE.md).

## Examples

Examples are capability-oriented rather than phase-oriented. Current examples include:

- `basic-api` — read-only platform status API interaction
- `connectivity` — platform connectivity status inspection
- `network-measurement` — bounded DNS measurement
- `dns-diagnostics` — DNS timing and address inspection
- `failover` — deterministic candidate-selection simulation
- `autopilot` — policy-controlled decision-loop simulation

See [`examples/README.md`](examples/README.md) for prerequisites, safety boundaries, and run commands.

## Safety model

IRP is designed for authorized, user-configured connectivity mechanisms. Example and simulation layers do not modify system routes, DNS configuration, firewall state, tunnels, or other host networking.

Future gateway/tunnel automation is constrained to authorized endpoints and must pass authentication, capability, health, policy/safety, audit and verification gates. An IP location alone is never treated as proof of service capability.

Consequential recovery actions are explicit, policy-controlled, auditable, bounded, reversible, and independently verified.

See [`SECURITY.md`](SECURITY.md) and [`docs/security-architecture.md`](docs/security-architecture.md).

## Documentation policy

`docs/` is the canonical user-facing documentation tree. Prefer updating an existing canonical document instead of creating a new document for the same concept.

- Product documentation describes behavior that exists and can be verified.
- Planned behavior is labeled as planned.
- Phase records are implementation/audit notes.
- Generated reports, temporary verification dumps, and one-off notes do not belong in public documentation navigation.

See [`docs/README.md`](docs/README.md) for the documentation map and rules.

## Contributing

Contributions should preserve the repository's validation and documentation contracts.

Before submitting a change, run the relevant checks locally and keep documentation aligned with the implementation. Pull requests are the preferred review mechanism for changes to `main`.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Security

Please do not report security vulnerabilities through public issues. Follow the process in [`SECURITY.md`](SECURITY.md).

## License

Licensed under the Apache License 2.0. See [`LICENSE`](LICENSE).

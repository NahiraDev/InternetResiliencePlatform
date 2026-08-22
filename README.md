# Internet Resilience Platform

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11.21.0-F69220.svg?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-000000.svg)](https://turborepo.com/)
[![Docker](https://img.shields.io/badge/Docker-supported-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com/)

**Internet Resilience Platform (IRP)** is an open-source TypeScript monorepo for measuring, diagnosing, and eventually automating recovery from unreliable network conditions.

The project is designed around a governed control loop:

```text
Observe → Measure → Detect → Diagnose → Decide
        → Policy / Safety Check → Plan → Apply
        → Verify → Rollback / Recovery → Telemetry
```

The repository is under active development. A capability is not considered production-ready merely because its source code exists; it must pass the applicable validation, test, build, runtime, security, and integration gates.

## What exists today

The current repository includes:

- Network and DNS measurement primitives
- DNS diagnostics and connectivity inspection
- A deterministic network decision engine
- Candidate scoring, policy/security gates, confidence, replay, and audit support
- Failover and Autopilot simulations that stop before host-network mutation
- API, CLI, resilience-runtime, observability, and plugin-oriented packages
- Docker production/runtime smoke validation
- Repository integrity validation and CI enforcement

The long-term goal is a policy-controlled Network Autopilot that can evaluate degradation, choose an authorized recovery path, verify the result, and recover safely when an action is ineffective.

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
- [Operational documentation](docs/operations/)
- [Architectural decisions](docs/adr/)
- [Testing policy](docs/testing/)
- [Current project state](PROJECT_STATE.md)
- [Roadmap](ROADMAP.md)

Historical phase records live under [`docs/phases/`](docs/phases/) and are not authoritative product documentation.

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

The deterministic smoke suite runs the local examples and does not mutate host networking. API examples require the normal API service to be running; see [`examples/README.md`](examples/README.md).

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
Interfaces (API / CLI / Desktop)
            ↓
Application + Policy
            ↓
Network Measurement
            ↓
Diagnosis + Network Intelligence
            ↓
Deterministic Decision Engine
            ↓
Policy / Safety / Audit
            ↓
Recovery / Failover
            ↓
Verification / Rollback
            ↓
Telemetry + History
```

Detailed architecture is documented in [`docs/architecture/`](docs/architecture/) and the [current architecture](docs/current-architecture.md).

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

IRP is designed for authorized, user-configured connectivity mechanisms. The example and simulation layers do not modify system routes, DNS configuration, firewall state, tunnels, or other host networking.

Consequential recovery actions are expected to be explicit, policy-controlled, auditable, bounded, and independently verified.

See [`SECURITY.md`](SECURITY.md) and [`docs/security-architecture.md`](docs/security-architecture.md).

## Documentation policy

`docs/` is the canonical user-facing documentation tree. Prefer updating an existing canonical document instead of creating a new document for the same concept.

- Product documentation describes behavior that exists and can be verified.
- Planned behavior is labeled as planned.
- Phase records are historical implementation notes.
- Generated reports, temporary verification dumps, and one-off notes do not belong in the public documentation navigation.

See [`docs/README.md`](docs/README.md) for the documentation map and rules.

## Contributing

Contributions should preserve the repository's validation and documentation contracts.

Before submitting a change, run the relevant checks locally and keep documentation aligned with the implementation. Pull requests are the preferred review mechanism for changes to `main`.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Security

Please do not report security vulnerabilities through public issues. Follow the process in [`SECURITY.md`](SECURITY.md).

## License

Licensed under the Apache License 2.0. See [`LICENSE`](LICENSE).

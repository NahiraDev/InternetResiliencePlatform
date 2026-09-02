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

The repository is under active development. Phases **0–70** define the core implementation, hardening and v1.0 certification baseline. **Phase 71 — Cross-Platform Distribution & GitHub Releases** is now the active post-v1 delivery phase: the release pipeline and distribution contract are implemented, while certification still requires a real tagged GitHub Release and inspection of the published assets.

A capability is not considered production-ready merely because source code exists; it must pass the applicable validation, test, build, runtime, security, device and integration gates.

## Product roadmap

The current roadmap is organized into these tracks:

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
- **71–74:** Post-v1 distribution, signed mobile delivery, native installers and controlled updates

See [`ROADMAP.md`](ROADMAP.md) for the concise roadmap and [`docs/architecture/post-v1-distribution-roadmap.md`](docs/architecture/post-v1-distribution-roadmap.md) for the post-v1 delivery sequence.

## Downloads

Published client artifacts are distributed through **[GitHub Releases](https://github.com/NahiraDev/InternetResiliencePlatform/releases)**. The canonical platform-specific guide is [`docs/downloads.md`](docs/downloads.md). iOS remains a source/developer bundle until signing and provisioning are configured.

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
- Platform client foundations for Linux, macOS, Windows, the shared mobile core, iOS Full Client and native iOS Network Extension boundaries
- A machine-readable Phase 70 v1.0 certification contract and fail-closed evidence verifier
- A machine-readable Phase 71 release contract, asset verifier and checksum-validated GitHub Release pipeline

The long-term goal is to evaluate degradation, choose an authorized recovery path, verify the result, recover safely when an action is ineffective, and expose the same capability model to every supported client.

## Start here

### For users and external developers

1. [Documentation index](docs/README.md)
2. [Downloads](docs/downloads.md)
3. [Getting started](docs/getting-started/quick-start.md)
4. [Development guide](docs/development.md)
5. [Configuration](docs/configuration.md)
6. [Current architecture](docs/current-architecture.md)
7. [API reference](docs/api/platform-status-api.md)
8. [Examples](examples/README.md)
9. [Security architecture](docs/security/security-architecture.md)

### For maintainers

- [Documentation index](docs/README.md)
- [Architecture documentation](docs/architecture/README.md)
- [Product architecture](docs/architecture/product-architecture.md)
- [70-phase product plan](docs/architecture/product-roadmap-70-phases.md)
- [Post-v1 distribution roadmap](docs/architecture/post-v1-distribution-roadmap.md)
- [Documentation audit](docs/audits/documentation-audit-2026-08-23.md)
- [Historical phase evidence matrix](docs/audits/phase-history-evidence-matrix.md)
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
clients/ios/          Native iOS Full Client and Network Extension boundary
examples/             Capability-oriented runnable examples
ops/                  Operational, release and deployment contracts
scripts/              Repository validation and automation
docs/                 Product, architecture, phase and operational documentation
```

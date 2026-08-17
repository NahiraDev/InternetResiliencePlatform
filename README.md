# Internet Resilience Platform

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-supported-F69220.svg?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![GitHub Actions](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF.svg?logo=githubactions&logoColor=white)](https://github.com/features/actions)

The **Internet Resilience Platform (IRP)** is an open-source, modular platform for measuring, modeling, monitoring, and improving the reliability of Internet-facing systems.

The project is designed as a long-term engineering foundation rather than a single-purpose application. It provides a structured monorepo, shared backend infrastructure, network intelligence primitives, observability, security controls, automation, and extensible interfaces that can evolve into desktop, mobile, distributed-node, and intelligent routing capabilities.

> **Project status:** Active development.
> The repository is being built incrementally through versioned implementation phases. Features are only considered production-ready after their corresponding validation and integration requirements have been satisfied.

---

## Table of Contents

- [Overview](#overview)
- [Goals](#goals)
- [Design Principles](#design-principles)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Core Capabilities](#core-capabilities)
- [Backend API](#backend-api)
- [Network Intelligence](#network-intelligence)
- [Security Model](#security-model)
- [Observability](#observability)
- [Development](#development)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Quality Gates](#quality-gates)
- [Testing Strategy](#testing-strategy)
- [Database](#database)
- [API Conventions](#api-conventions)
- [CLI](#cli)
- [Documentation](#documentation)
- [CI/CD](#cicd)
- [Project Phases](#project-phases)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security Reporting](#security-reporting)
- [License](#license)

---

## Overview

Internet connectivity is not a binary property.

A system may be technically connected while simultaneously experiencing:

- High latency
- DNS degradation
- Packet loss
- IPv4 or IPv6 failures
- Unstable TCP connections
- HTTP availability problems
- Throughput degradation
- Provider-specific failures
- Intermittent connectivity
- Regional or path-dependent instability

IRP provides the infrastructure required to **observe these conditions, measure them consistently, aggregate the results, and expose them through stable application interfaces**.

The platform is intentionally modular. Network measurement logic is separated from API, CLI, storage, authentication, and presentation layers so that new capabilities can be introduced without coupling unrelated components.

---

## Goals

The primary goals of the project are:

1. **Reliability**

   - Build resilient infrastructure that can operate under unstable network conditions.
   - Detect degradation rather than relying on a single connectivity signal.
   - Support continuous measurement and historical analysis.

2. **Modularity**

   - Keep network capabilities behind explicit contracts.
   - Allow independent services, plugins, probes, and clients to evolve separately.
   - Minimize coupling between infrastructure layers.

3. **Security**

   - Apply secure-by-default authentication and authorization.
   - Maintain explicit trust boundaries.
   - Avoid insecure credential fallbacks and implicit privilege escalation.

4. **Observability**

   - Make system state measurable.
   - Expose health, readiness, metrics, and operational signals.
   - Support structured telemetry and long-term monitoring.

5. **Auditability**

   - Make architectural decisions explicit.
   - Preserve development history and validation results.
   - Use deterministic repository and CI checks.

6. **Maintainability**

   - Favor typed interfaces, stable contracts, automated validation, and clear ownership boundaries.
   - Keep implementation details replaceable where practical.

---

## Design Principles

IRP follows several architectural principles:

### Separation of Concerns

Application logic, domain logic, network measurement, persistence, authentication, observability, and client interfaces should not be unnecessarily coupled.

### Contract-First Design

Shared contracts and API schemas should be defined before implementation details become dependencies across packages.

### Secure by Default

Security-sensitive functionality must fail closed rather than silently falling back to unsafe behavior.

### Measurement Before Automation

The platform should establish reliable measurement and diagnosis primitives before introducing higher-level automation and decision systems.

### Explicit Lifecycle Management

Resources such as users, sessions, tokens, projects, workspaces, and network measurements should have explicit lifecycle semantics.

### Deterministic Validation

The repository should be continuously verifiable through reproducible local and CI checks.

### Incremental Delivery

The project is developed through implementation phases. Each phase should leave the repository in a coherent, testable state.

---

# Architecture

IRP is designed as a **TypeScript-first modular monorepo**.

At a high level:

```text
                         Internet Resilience Platform
                                      │
              ┌───────────────────────┼────────────────────────┐
              │                       │                        │
         Client Layer           Application Layer       Observability
              │                       │                        │
      ┌───────┼────────┐       ┌──────┼─────────┐       ┌──────┼──────┐
      │       │        │       │      │         │       │      │      │
    CLI    Electron   Mobile   API   Auth     Network   Logs  Metrics Traces
                             │
                     ┌───────┼────────┐
                     │       │        │
                  Domain   Services  Plugins
                     │       │        │
                     └───────┼────────┘
                             │
                     Persistence Layer
                             │
                          PostgreSQL
```

The architecture is intentionally extensible toward:

- Desktop clients
- Mobile clients
- Distributed measurement nodes
- Plugin-based network probes
- Intelligent routing
- Automatic failover and recovery
- Connectivity orchestration
- Additional observability backends

These capabilities are introduced progressively and should not be assumed to be production-ready merely because the architecture supports them.

---

# Repository Structure

The repository is organized as a monorepo:

```text
.
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── dependabot.yml
│   └── workflows/
│
├── apps/
│   ├── ...                     # Applications and user-facing clients
│   └── ...
│
├── packages/
│   ├── api/
│   ├── auth/
│   ├── cli/
│   ├── config/
│   ├── connectivity/
│   ├── database/
│   ├── network/
│   └── ...
│
├── docs/
│   ├── architecture/
│   ├── adr/
│   ├── development/
│   ├── network/
│   └── security/
│
├── scripts/
│   ├── bootstrap.sh
│   ├── lint.sh
│   ├── test.sh
│   └── ...
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── pnpm-lock.yaml
├── tsconfig.json
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
└── README.md
```

> The exact package and application inventory evolves with the implementation phases. The repository should be treated as the authoritative source for the current package graph.

---

# Core Capabilities

The platform currently establishes the following foundational capabilities.

## Repository Foundation

- Monorepo architecture
- Shared TypeScript tooling
- Reproducible package management with `pnpm`
- Repository validation
- Development scripts
- GitHub Actions automation
- Dependency update automation
- Architecture documentation
- ADR-based decision tracking

## Core Backend

The backend exposes versioned APIs under:

```text
/api/v1
```

The current foundation includes:

- Authentication
- HMAC-signed JWT access tokens
- Refresh-token lifecycle
- Role-based access control
- Permission checks
- Session lifecycle
- Standardized API responses
- Standardized error responses
- Pagination metadata
- Health endpoints
- Readiness endpoints
- Metrics endpoints
- User APIs
- Organization APIs
- Project APIs
- Workspace APIs

## Data Layer

The database model is defined in:

```text
packages/database/prisma/schema.prisma
```

The model currently covers:

- Users
- Organizations
- Projects
- Workspaces
- Memberships
- Roles
- Permissions
- Sessions
- Tokens
- Audit logs
- Outbox events
- Cache entries

The schema uses:

- UUID primary keys
- Explicit foreign keys
- Timestamps
- Constraints
- Indexes
- Lifecycle-aware deletion semantics
- Soft-delete fields where required

---

# Backend API

The backend uses a versioned API namespace:

```text
/api/v1
```

Versioning is intentional and provides a stable boundary between clients and server-side implementation changes.

## Response Model

Successful responses should follow the repository's standard response envelope.

Conceptually:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Errors should follow a consistent structure:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  },
  "meta": {}
}
```

The exact schema is defined by the backend contracts and should be treated as authoritative over examples in this document.

## Health and Operational Endpoints

Core health surfaces include:

```text
GET /api/v1/health
GET /api/v1/health/ready
GET /api/v1/health/network
GET /api/v1/metrics
GET /api/v1/metrics/network
```

These endpoints exist to support operational monitoring, diagnostics, orchestration, and automated validation.

---

# Network Intelligence

The network intelligence subsystem is designed as a **measurement-first subsystem**.

Its responsibility is to observe network conditions and produce normalized measurements.

It does not require a single monolithic network implementation.

## Current Measurement Capabilities

The network subsystem supports modular probes for:

- DNS latency
- TCP latency
- HTTP availability
- Packet-loss estimation
- Connection stability
- Basic throughput estimation
- IPv4 availability
- IPv6 availability
- Locally available provider information

The probing layer is designed around a plugin-style contract so additional measurements can be added without changing API or CLI consumers.

Conceptually:

```text
Probe Contract
      │
      ├── DNS Probe
      ├── TCP Probe
      ├── HTTP Probe
      ├── Packet Loss Probe
      ├── Stability Probe
      ├── Throughput Probe
      ├── IPv4 Probe
      ├── IPv6 Probe
      └── Provider Probe
```

## Network API

Current network-related operational surfaces include:

```text
GET  /api/v1/health/network
GET  /api/v1/metrics/network
GET  /api/v1/measurements
POST /api/v1/probes/run
```

## Network CLI

The CLI exposes a network diagnostic command:

```bash
irp network check
```

The command is intended to summarize:

- DNS status
- Measured latency
- Connectivity score
- Detected issues

The CLI should consume the same contracts and measurement semantics as the API rather than maintaining a separate implementation.

---

# Security Model

Security is a first-class architectural concern.

## Authentication

The backend uses:

- HMAC-signed JWT access tokens
- Refresh-token lifecycle management
- Session tracking
- Explicit token invalidation semantics

Production authentication paths must fail safely and must not silently fall back to insecure defaults.

## Authorization

Access control is based on:

```text
User
  └── Membership
        └── Role
              └── Permissions
```

Authorization should be evaluated at the application boundary and enforced consistently across protected resources.

## Auditability

Security-relevant state changes should be represented through auditable records where appropriate, including:

- Authentication events
- Session lifecycle events
- Permission-sensitive operations
- Administrative changes
- Other security-relevant domain mutations

## Security Boundaries

The platform should preserve clear boundaries between:

- External clients
- API handlers
- Authentication
- Authorization
- Domain services
- Database access
- Network measurement infrastructure
- Operational tooling

---

# Observability

Observability is designed around three complementary signals:

```text
Logs
Metrics
Traces
```

## Metrics

Network telemetry includes metrics such as:

```text
probe_success_total
probe_failure_total
network_latency_ms
network_health_score
```

The exact metric inventory may expand as new subsystems are implemented.

## Health

Health endpoints distinguish between application availability and subsystem readiness where appropriate.

## Future Telemetry

The architecture is prepared for broader use of:

- OpenTelemetry
- Prometheus
- Distributed tracing
- Structured logging
- Measurement history
- System-wide health aggregation

---

# Development

## Prerequisites

The development environment requires:

- Node.js compatible with the repository's supported version
- `pnpm`
- Git
- PostgreSQL for database-backed development
- A Unix-like shell for repository helper scripts

Verify the local toolchain:

```bash
node --version
pnpm --version
git --version
```

Do not use `npm` for repository package-management workflows when a `pnpm` equivalent exists.

---

# Installation

Clone the repository:

```bash
git clone <repository-url>
cd InternetResiliencePlatform
```

Install dependencies:

```bash
pnpm install
```

Run the repository bootstrap script when required:

```bash
./scripts/bootstrap.sh
```

Then run the standard validation commands:

```bash
pnpm lint
pnpm test
pnpm build
```

Repository-specific helper scripts may also be available:

```bash
./scripts/lint.sh
./scripts/test.sh
```

---

# Environment Configuration

Environment configuration must be supplied through environment variables or approved local environment files.

Sensitive values must never be committed to source control.

Typical configuration categories include:

```text
DATABASE_URL
JWT configuration
Application secrets
Service configuration
Observability configuration
Runtime configuration
```

The repository's environment examples and configuration packages are authoritative for the current variable names and validation rules.

Do not copy production credentials into development files or commit generated secrets.

---

# Quality Gates

Every implementation phase should preserve a consistent quality pipeline.

The minimum expected validation set is:

```bash
pnpm lint
pnpm test
pnpm build
```

Repository-specific validation may additionally include:

```bash
pnpm validate
```

Depending on the active phase, validation can also include:

- Type checking
- Package-level tests
- Integration tests
- Database validation
- API contract validation
- Repository structure validation
- CI workflow validation
- Runtime verification
- Security checks

A change should not be considered complete merely because it compiles. It should satisfy the applicable phase-level validation requirements.

---

# Testing Strategy

IRP follows a layered testing strategy.

## Unit Tests

Validate isolated:

- Domain logic
- Utility functions
- Probes
- Parsers
- Validators
- Security primitives

## Integration Tests

Validate interactions between:

- API and database
- Authentication and sessions
- Services and repositories
- Network probes and aggregation layers

## Contract Tests

Validate stable boundaries such as:

- API response contracts
- Shared package interfaces
- Plugin contracts
- Configuration contracts

## Runtime Verification

Phase-level runtime checks verify that implemented components actually operate together rather than only passing isolated unit tests.

---

# Database

The persistence layer uses PostgreSQL with Prisma.

Schema location:

```text
packages/database/prisma/schema.prisma
```

Typical development commands are defined by the repository scripts and package configuration.

Database migrations must be treated as versioned infrastructure changes.

Schema changes should consider:

- Backward compatibility
- Data migration requirements
- Index impact
- Constraint behavior
- Soft-delete semantics
- Transaction boundaries
- Auditability
- Rollback strategy

---

# API Conventions

The API follows several general conventions.

## Versioning

All public application endpoints are versioned:

```text
/api/v1/...
```

## Naming

Resources should use stable, predictable names and avoid exposing internal implementation details.

## Pagination

Collection endpoints should provide explicit pagination metadata.

## Errors

Clients should consume stable error codes rather than attempting to parse human-readable messages.

## Idempotency

Operations with retry-sensitive side effects should define explicit idempotency semantics where necessary.

## Validation

Input validation occurs at the application boundary before domain operations are executed.

---

# CLI

The CLI provides an operational interface to platform capabilities.

Example:

```bash
irp network check
```

The CLI should follow the same service contracts used by other clients where possible.

CLI commands should:

- Return meaningful exit codes
- Produce machine-readable output where appropriate
- Remain safe to execute repeatedly
- Avoid leaking secrets
- Clearly distinguish errors from successful measurements

---

# Documentation

Documentation is part of the architecture.

The repository maintains documentation for:

```text
docs/
├── architecture/
├── adr/
├── development/
├── network/
└── security/
```

## Architecture Decision Records

Architectural decisions should be recorded as ADRs when they materially affect:

- System structure
- Dependencies
- Security boundaries
- Data models
- Runtime behavior
- Deployment architecture
- Compatibility guarantees

An ADR should explain the decision, context, alternatives, and consequences.

---

# CI/CD

GitHub Actions provides automated repository validation.

CI is responsible for maintaining repeatable checks such as:

- Dependency installation
- Linting
- Type validation
- Tests
- Builds
- Repository validation
- Security-oriented checks where applicable

CI configuration lives under:

```text
.github/workflows/
```

Dependabot configuration is maintained under:

```text
.github/dependabot.yml
```

CI should remain deterministic and should use the repository-supported package manager and runtime versions.

---

# Project Phases

IRP is developed incrementally.

The initial foundation established:

### Phase 0 — Repository Bootstrap

- Repository structure
- Governance
- Documentation foundation
- Development conventions
- Initial automation

### Phase 1 — Monorepo Foundation

- Workspace structure
- Shared configuration
- Package boundaries
- TypeScript foundation
- Shared development tooling

### Phase 2 — Quality Infrastructure

- Linting
- Testing foundations
- Formatting conventions
- Validation tooling
- Repository quality gates

### Phase 3 — CI/CD Foundation

- GitHub Actions
- Automated validation
- Dependency automation
- Repeatable CI workflows

### Phase 4 — Core Architecture

- Domain boundaries
- Shared contracts
- Core service architecture
- Architectural documentation
- Initial infrastructure abstractions

### Phase 5 — Core Backend

- Authentication
- Authorization
- Sessions
- JWT lifecycle
- Standardized responses
- Health/readiness
- Metrics
- User APIs
- Organization APIs
- Project APIs
- Workspace APIs
- Core database model

### Phase 6 — Network Intelligence Core

- Network probe contracts
- DNS measurement
- TCP measurement
- HTTP availability
- Packet-loss estimation
- Connection stability
- Throughput estimation
- IPv4/IPv6 availability
- Provider information
- Network health aggregation
- Network measurement API
- Network CLI

Subsequent phases build on these foundations.

---

# Roadmap

The long-term roadmap is organized around independent but composable capabilities.

Planned areas include:

- Network intelligence expansion
- Smart DNS engine
- Multi-source connectivity management
- Intelligent routing
- Automatic failover and recovery
- VPN/proxy abstraction
- Intelligent decision engines
- Electron desktop client
- Mobile clients
- Backend control plane
- Distributed measurement nodes
- Advanced observability
- Security hardening
- Production release engineering
- Operational tooling
- Historical measurement and analytics

Roadmap items are not considered implemented until they are present in the repository and pass their corresponding validation gates.

---

# Contributing

Contributions are welcome.

Before creating an issue or pull request, read:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- Relevant architecture documentation
- Relevant ADRs

A contribution should:

- Follow repository conventions
- Keep package boundaries clear
- Include appropriate tests
- Update documentation when behavior or architecture changes
- Avoid introducing unnecessary dependencies
- Preserve existing API contracts where compatibility is required
- Pass all applicable validation and CI checks

For larger architectural changes, add or update an ADR before implementation becomes irreversible.

---

# Security Reporting

Do not report security vulnerabilities through public GitHub issues.

Follow the responsible disclosure process documented in:

[SECURITY.md](SECURITY.md)

Security-sensitive changes should be reviewed with particular attention to:

- Authentication
- Authorization
- Token handling
- Secrets
- Database access
- Network operations
- Process execution
- Client-to-server trust boundaries
- Privilege boundaries
- Supply-chain dependencies

---

# License

Internet Resilience Platform is licensed under the **Apache License 2.0**.

See [LICENSE](LICENSE) for the full license text.

---

# Project Status

IRP is under active development.

The repository is intentionally implemented in phases so that each layer can be validated before higher-level functionality depends on it.

The current codebase should therefore be interpreted according to the capabilities actually present in the repository, its tests, CI workflows, and phase documentation—not solely according to the future roadmap described above.

---

## Maintainers

Internet Resilience Platform is maintained as an open-source engineering project.

For project governance, development standards, security reporting, and contribution rules, refer to the repository documentation and policy files.

---

## Links

- [Repository](https://github.com/NahiraDev/InternetResiliencePlatform)
- [Contributing Guide](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [License](LICENSE)
- [Documentation](docs/)

## Phase 26 Network Autopilot

Phase 26 adds the first governed Network Autopilot control loop in `@irp/resilience-runtime`. The default posture is conservative: `enabled=false` and `mode=OBSERVE_ONLY`, so observations, measurement, detection, diagnosis, deterministic decisioning, policy evaluation, planning, audit, dry-run, and shadow decisions can run without applying consequential changes. Autonomous application requires an explicit policy created with `createAutopilotPolicy({ enabled: true, mode: 'AUTONOMOUS', allowedActions: [...] })`.

The executable loop follows `OBSERVE -> MEASURE -> DETECT -> DIAGNOSE -> DECIDE -> POLICY_CHECK -> PLAN -> APPLY -> VERIFY`, with rollback and recovery when verification fails. Actions are typed and must be registered in the action catalog; no arbitrary command execution interface exists.

API routes are exposed under `/api/v1/autopilot/*` for status, runs, actions, policies, health, approvals, rollbacks, and circuit-breaker reset. CLI inspection commands are available under `irp autopilot`.

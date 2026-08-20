# Internet Resilience Platform

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11.21.0-F69220.svg?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-000000.svg)](https://turbo.build/repo)
[![Docker](https://img.shields.io/badge/Docker-production--runtime-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com/)
[![GitHub Actions](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF.svg?logo=githubactions&logoColor=white)](https://github.com/features/actions)

**Internet Resilience Platform (IRP)** is an open-source, TypeScript-first platform for **understanding, measuring, diagnosing, and improving Internet connectivity under real-world failure conditions**.

IRP is being built for people and systems that cannot simply assume that “the Internet is working.” DNS can fail. Routes can degrade. TCP connections can reset. TLS can fail. A service can return an error even when the underlying network is healthy. IPv4 and IPv6 can behave differently. Connectivity can be intermittent or path-dependent.

The purpose of IRP is to turn those failures into **measurable signals, actionable diagnoses, and eventually automated, verified recovery decisions**.

> **Project status:** Active development. The repository is being implemented through a controlled 48-phase roadmap. A capability is not considered production-ready merely because its code exists; it must pass the applicable typecheck, lint, test, build, runtime, security, and integration gates.

---

## What is IRP?

IRP is intended to become a **network resilience control plane** rather than another simple speed-test or monitoring dashboard.

At a high level, it combines:

- Continuous network observation
- Multi-layer connectivity measurement
- Failure classification and diagnosis
- Historical network intelligence
- Deterministic local decision-making
- Policy-controlled automation
- Failover and recovery orchestration
- Verification and rollback
- Structured telemetry and auditability
- Extensible plugins and probes
- API, CLI, desktop, and distributed-node capabilities

The long-term operating model is:

```text
OBSERVE
   ↓
MEASURE
   ↓
DETECT
   ↓
DIAGNOSE
   ↓
DECIDE
   ↓
POLICY / SAFETY CHECK
   ↓
PLAN
   ↓
APPLY
   ↓
VERIFY
   ↓
SUCCESS ───────────────→ CONTINUE
   │
   └── FAILURE ────────→ ROLLBACK / RECOVERY
                               │
                               ↓
                           TELEMETRY
```

This closed-loop model is the central direction of the project.

---

## The Problem

Internet availability is not binary.

A device may report that it is connected while an important destination is effectively unusable. Conversely, a single failed request does not necessarily mean that the entire Internet connection is broken.

Common failure modes include:

- DNS resolution failures
- Slow or unreliable DNS resolvers
- TCP connection timeouts
- Connection resets
- TLS negotiation failures
- HTTP failures
- Intermittent packet loss
- High latency and jitter
- IPv4/IPv6 asymmetry
- Route instability
- Provider-specific degradation
- Service-specific reachability problems
- Local network failures
- Database or backend dependency failures
- Container/runtime failures

A professional resilience system must distinguish these cases instead of treating everything as “Internet down.”

### About HTTP 403 and blocked services

An HTTP `403` is an **application-layer response**, not a universal diagnosis. It can originate from access-control policy, authentication, a service configuration, a CDN/WAF, regional policy, an intermediary, or another application-layer condition.

IRP therefore does not treat `403` as proof of one particular cause. It measures the surrounding network signals and reports the most defensible diagnosis supported by evidence.

IRP is designed to improve reliability through **authorized, user-configured connectivity mechanisms**. It does not promise to defeat access controls, censorship systems, provider policies, or legal restrictions.

---

## What IRP is trying to achieve

The end-user experience we are building toward is simple:

> **When connectivity degrades, the user should not have to become a network engineer to understand what happened or manually troubleshoot every layer.**

The system should be able to continuously observe the connection, identify degradation early, determine the most likely failure domain, evaluate available recovery options, apply an authorized action when policy permits it, verify the result, and roll back when the action makes the situation worse.

The objective is not merely to collect metrics. The objective is **reliable decision-making under uncertainty**.

---

# Core Principles

## 1. Measure before deciding

Every consequential network decision should be grounded in current measurements and explicit health signals.

## 2. Fast decisions must be local

The critical connectivity path must not depend on an external LLM or remote AI service.

Latency-sensitive decisions should use local, deterministic algorithms so that the system can continue operating even when Internet access is degraded.

AI/ML can be used outside the critical path for tasks such as historical analysis, anomaly detection, pattern discovery, policy optimization, and operator assistance.

## 3. Detect degradation before complete failure

The platform should continuously monitor health so it can recognize deterioration before an application request becomes a hard failure.

```text
Healthy
   ↓
Degrading
   ↓
Critical
   ↓
Failed
```

Where possible, recovery preparation should begin during the degradation stage rather than waiting for a full outage.

## 4. Verify every recovery action

An action is not successful because it executed successfully.

It is successful only when the resulting connectivity state has been independently verified.

## 5. Roll back unsafe or ineffective changes

Recovery mechanisms must have explicit rollback semantics and circuit-breaker behavior.

## 6. Fail closed on security-sensitive operations

Security and authorization boundaries must not silently fall back to unsafe behavior.

## 7. Production correctness over demo behavior

A feature is not considered complete because it works in a happy-path demonstration. It must survive failure injection and runtime verification appropriate to its scope.

---

# Architecture

IRP is a modular monorepo built around TypeScript, Node.js, PostgreSQL, Turborepo, pnpm, Docker, and a plugin-oriented network intelligence architecture.

```text
                         ┌──────────────────────────┐
                         │      User / Operator      │
                         └────────────┬─────────────┘
                                      │
                  ┌───────────────────┼───────────────────┐
                  │                   │                   │
               Desktop              CLI                 API
                  │                   │                   │
                  └───────────────────┼───────────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │     Application Layer    │
                         │ Auth / API / Policies    │
                         └────────────┬─────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │ Connectivity Intelligence│
                         ├──────────────────────────┤
                         │ DNS / TCP / TLS / HTTP   │
                         │ IPv4 / IPv6 / Routing    │
                         │ Loss / Latency / Stability│
                         └────────────┬─────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │     Diagnosis Engine     │
                         └────────────┬─────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │   Fast Decision Engine   │
                         │ Local / Deterministic    │
                         └────────────┬─────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │ Policy / Safety / Audit  │
                         └────────────┬─────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │ Recovery / Failover      │
                         └────────────┬─────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │ Verify / Rollback        │
                         └────────────┬─────────────┘
                                      ↓
                         ┌──────────────────────────┐
                         │ Telemetry / History      │
                         └──────────────────────────┘
                                      │
                                      ↓
                                  PostgreSQL
```

The architecture deliberately separates:

- User interfaces
- API and application services
- Network measurement
- Diagnosis
- Decision-making
- Policy enforcement
- Recovery actions
- Persistence
- Observability
- Security

This separation allows individual subsystems to evolve without turning the platform into a single tightly coupled service.

---

# Network Intelligence

Network intelligence is the technical core of IRP.

The platform models connectivity as multiple observable layers rather than one Boolean value.

```text
Destination
    │
    ├── DNS
    │     └── resolution / latency / consistency
    │
    ├── TCP
    │     └── connection / timeout / reset / latency
    │
    ├── TLS
    │     └── negotiation / certificate / handshake
    │
    ├── HTTP
    │     └── status / latency / availability
    │
    └── Application
          └── service-level reachability
```

Measurements are normalized into health signals that can be compared over time and across destinations.

### Planned intelligence capabilities

- Continuous probes
- Multi-destination health scoring
- Historical baselines
- Failure classification
- Anomaly detection
- Degradation detection
- Provider/path comparison
- IPv4/IPv6 comparison
- Latency and packet-loss analysis
- Stability scoring
- Recovery verification
- Decision confidence

---

# Network Autopilot

IRP already has the architectural foundation for a governed Network Autopilot control loop.

The current design is intentionally conservative. Observation and decisioning can operate without applying consequential changes, while autonomous actions require explicit policy authorization.

The target lifecycle is:

```text
OBSERVE
  → MEASURE
  → DETECT
  → DIAGNOSE
  → DECIDE
  → POLICY_CHECK
  → PLAN
  → APPLY
  → VERIFY
  → RECOVER / ROLLBACK
```

Actions are intended to be typed, registered, policy-controlled, auditable, and independently verifiable. Arbitrary command execution is not the design goal.

### Why this matters

A monitoring system tells you:

> “Something is wrong.”

A resilience system should eventually be able to tell you:

> “Connectivity is degrading, the evidence points to this failure domain, this authorized recovery option has the highest expected value, it was applied, and verification confirms whether it worked.”

That is the transition from monitoring to resilience automation.

---

# Fast Decision Engine

Decision speed is a first-class requirement.

The critical path is designed to remain local:

```text
Network signal
      ↓
Local state
      ↓
Deterministic classifier
      ↓
Policy evaluation
      ↓
Recovery decision
```

The architecture explicitly avoids putting an LLM in this path.

The target performance model is:

| Operation | Architectural target |
|---|---:|
| Initial local failure classification | < 100 ms |
| Deterministic decision evaluation | < 10 ms |
| Recovery action selection | < 10 ms |
| Recovery initiation | < 50 ms |
| Initial recovery verification | < 500 ms |

These are engineering targets for the local control loop, not guarantees about end-to-end Internet recovery time. External networks, providers, destinations, and authorized recovery mechanisms can impose substantially larger delays.

---

# Preemptive Recovery

IRP is designed to recover **before total failure whenever evidence permits it**.

Instead of:

```text
request
  ↓
long timeout
  ↓
failure
  ↓
diagnosis
  ↓
recovery
```

The target behavior is:

```text
continuous health monitoring
          ↓
     degradation detected
          ↓
  evaluate alternatives
          ↓
     verify candidate
          ↓
      switch/recover
          ↓
        verify
```

This is one of the main differences between IRP and a conventional connectivity checker.

---

# Safety and Control

Autonomous networking requires strong boundaries.

IRP therefore follows these rules:

- No arbitrary shell execution as a recovery primitive
- Explicit action catalogs
- Explicit authorization policies
- Dry-run and observe-only modes
- Audit records for consequential decisions
- Circuit breakers
- Verification after actions
- Rollback where supported
- Bounded retries
- Rate limiting and backoff
- Clear failure states
- No silent privilege escalation

The system should prefer **doing nothing safely** over taking an uncontrolled action with uncertain consequences.

---

# Security

Security is a core subsystem, not an afterthought.

The project uses explicit authentication, authorization, session, token, and audit boundaries.

Security requirements include:

- Secure-by-default configuration
- Explicit trust boundaries
- Production-safe authentication behavior
- Role and permission enforcement
- Token/session lifecycle management
- Auditability of security-sensitive operations
- Secret hygiene
- Dependency validation
- Container hardening
- Non-root runtime operation where supported
- Fail-closed behavior for security-sensitive paths

See [SECURITY.md](SECURITY.md) for the project's security reporting policy.

---

# Observability

IRP treats observability as part of the product itself.

The platform is designed around:

```text
Logs + Metrics + Traces + Health + Historical Measurements
```

Operational signals should answer:

- Is the system running?
- Is it ready?
- Is the network healthy?
- Which layer is failing?
- When did degradation begin?
- What action did the system take?
- Why did it take that action?
- Did the action work?
- Was rollback required?

The observability stack is designed to integrate with OpenTelemetry, Prometheus-style metrics, structured logging, and distributed tracing as the relevant phases mature.

---

# Production Runtime

Production-like runtime behavior is treated as a separate engineering concern from source-code correctness.

The Docker architecture is designed around:

- Multi-stage production images
- Non-root API execution
- Explicit writable paths
- PostgreSQL readiness
- Migration lifecycle management
- Container health checks
- Readiness/liveness semantics
- Restart recovery
- Controlled shutdown
- Runtime smoke testing

The project includes a production-oriented Docker smoke workflow intended to verify the complete lifecycle rather than only whether an image builds.

A container that compiles but cannot start correctly is considered a failed implementation.

---

# Monorepo

IRP uses pnpm workspaces and Turborepo.

The repository contains modular packages covering areas such as:

```text
packages/
├── api
├── auth
├── auto-optimization
├── cli
├── config
├── connectivity
├── core
├── daemon
├── database
├── dns
├── events
├── failover
├── historical-analysis
├── kernel
├── logger
├── metrics
├── network
├── network-intelligence
├── plugin-api
├── plugin-config
├── plugin-events
├── plugin-loader
├── plugin-manager
├── plugin-registry
├── plugin-runtime
├── plugin-samples
├── plugin-sandbox
├── plugin-sdk
├── queue
├── resilience-runtime
├── routing
├── security
├── shared
├── telemetry
├── tunnel
├── types
└── utils
```

The exact package graph is authoritative in the repository. Packages are added or reorganized as the roadmap progresses.

---

# Technology Stack

| Area | Technology |
|---|---|
| Language | TypeScript |
| Runtime | Node.js 24+ |
| Package manager | pnpm 11.21+ |
| Monorepo | pnpm workspaces + Turborepo |
| Backend | Node.js / TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Testing | Vitest |
| Linting | ESLint |
| Formatting | Prettier |
| Containers | Docker / Compose |
| CI/CD | GitHub Actions |
| Observability | OpenTelemetry / Prometheus-oriented architecture |
| Desktop direction | Electron |

---

# Getting Started

## Prerequisites

Current repository requirements are:

- Node.js `>= 24.0.0`
- pnpm `>= 11.21.0`
- Git
- Docker and Docker Compose for runtime verification
- PostgreSQL for database-backed local development when not using Compose

Verify the toolchain:

```bash
node --version
pnpm --version
git --version
docker --version
```

## Install

```bash
git clone https://github.com/NahiraDev/InternetResiliencePlatform.git
cd InternetResiliencePlatform
pnpm install
```

## Validate the repository

Run the standard quality gates:

```bash
pnpm validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

For production-like Docker verification:

```bash
pnpm docker:smoke
```

Do not use `npm` for repository package-management workflows when an equivalent `pnpm` command exists.

---

# Development Workflow

A normal development cycle should look like:

```text
Change
  ↓
Format
  ↓
Typecheck
  ↓
Lint
  ↓
Unit / Integration tests
  ↓
Build
  ↓
Runtime verification
  ↓
Commit
  ↓
CI
```

For changes affecting networking, containers, authentication, database behavior, or autonomous decision-making, additional phase-specific validation is required.

---

# Quality Gates

The repository uses multiple independent gates because “it builds” is not sufficient evidence of correctness.

### Static correctness

```bash
pnpm typecheck
pnpm lint
pnpm validate
```

### Functional correctness

```bash
pnpm test
```

### Build correctness

```bash
pnpm build
```

### Runtime correctness

```bash
pnpm docker:smoke
```

### Security correctness

Security-sensitive changes should additionally pass the applicable repository security and dependency checks.

A phase is complete only when its required gates are green.

---

# Testing Strategy

IRP follows a layered testing model.

## Unit tests

Used for:

- Domain logic
- Network classifiers
- Utility functions
- Configuration validation
- Security primitives
- Decision rules
- Recovery policies

## Integration tests

Used for:

- API/database interaction
- Authentication/session lifecycle
- Service boundaries
- Network intelligence aggregation
- Plugin contracts

## End-to-end tests

Used for:

- Complete API flows
- Autopilot lifecycle
- Runtime behavior
- Database readiness
- Recovery verification

## Failure injection / chaos testing

Later phases explicitly require controlled failures such as:

- DNS failure
- TCP timeout
- Connection reset
- TLS failure
- Database unavailability
- Container restart
- Dependency failure
- Partial network degradation

The purpose is to prove that recovery behavior works under failure rather than only in ideal conditions.

---

# Roadmap

IRP is being developed through **48 controlled phases**.

The roadmap is intentionally long because reliability software needs infrastructure, observability, security, runtime verification, and failure testing in addition to feature development.

## Foundation and platform

**Phase 0–10** establish the monorepo, quality infrastructure, CI/CD, core architecture, shared services, network foundation, and network intelligence primitives.

## Intelligence and automation

**Phase 11–20** expand network intelligence, Smart DNS, connectivity management, routing, failover, VPN/proxy abstraction, decision systems, clients, API control, and observability.

## Runtime and resilience

**Phase 21–30** focus on runtime verification, production hardening, security, Docker reliability, Network Autopilot, and production-oriented validation.

## Stabilization and autonomous resilience

The final eight phases are:

| Phase | Objective |
|---|---|
| **41** | Platform Stabilization — eliminate remaining CI, lockfile, type, dependency, and repository-integrity failures |
| **42** | Production Docker & Runtime Hardening — image correctness, non-root operation, dependency completeness, startup, migrations, health, and restart behavior |
| **43** | Connectivity Observation Engine — continuous DNS/TCP/TLS/HTTP and network health probing |
| **44** | Network Diagnosis Engine — evidence-based classification of failures and degradation |
| **45** | Fast Decision Engine — low-latency, local, deterministic recovery decisions |
| **46** | Autonomous Recovery Engine — policy-controlled recovery, verification, failover, rollback, and circuit breakers |
| **47** | Connectivity Agent / Network Autopilot — integration of observation, diagnosis, decision, policy, recovery, and telemetry into one control loop |
| **48** | Production Validation & Chaos Testing — failure injection, load testing, recovery SLOs, runtime certification, and release validation |

### Definition of “done”

The project is not considered finished when all source files exist.

The target completion standard is:

```text
Feature implemented
      ↓
Unit tests
      ↓
Integration tests
      ↓
Typecheck / lint
      ↓
Build
      ↓
Production-like runtime
      ↓
Failure injection
      ↓
Recovery verification
      ↓
Security review
      ↓
CI green
      ↓
Release certification
```

---

# Current Development Reality

IRP is an ambitious project and is still under active development.

The repository contains substantial architecture and implementation work, but some subsystems are still being stabilized. In particular, CI, dependency integrity, TypeScript strictness, Docker runtime behavior, and production smoke verification are treated as engineering work that must be completed before declaring the platform production-ready.

This README intentionally does **not** claim that every planned capability is already available to end users.

That distinction matters: the roadmap describes the destination; the repository and its passing validation gates determine what is actually ready today.

---

# Repository Layout

```text
.
├── .github/                 # CI, security, repository automation
├── apps/                    # Deployable applications
├── packages/                # Modular platform packages
├── docs/                    # Architecture, phases, operations, security
├── examples/                # Demonstrations and phase examples
├── scripts/                 # Validation, runtime, and maintenance tooling
├── Dockerfile               # Production container build
├── Dockerfile.dev           # Development container build
├── docker-compose.yml       # Local/production-like composition
├── package.json             # Workspace scripts and toolchain
├── pnpm-workspace.yaml      # Workspace definition
├── pnpm-lock.yaml           # Dependency lockfile
├── turbo.json               # Turborepo configuration
├── tsconfig.json            # TypeScript configuration
├── ROADMAP.md               # Detailed phase roadmap
├── CONTRIBUTING.md          # Contribution workflow
├── SECURITY.md              # Security policy
├── LICENSE                  # Apache-2.0 license
└── README.md               # Project overview
```

---

# Documentation

Important project documents include:

- [Roadmap](ROADMAP.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [License](LICENSE)
- [Documentation](docs/)

Phase-specific implementation documents are maintained under `docs/phases/` as the project progresses.

---

# Contributing

Contributions are welcome when they improve the project's reliability, correctness, security, maintainability, or user experience.

Before submitting a change:

1. Understand the relevant package boundaries.
2. Check the roadmap and existing architecture decisions.
3. Keep changes scoped and testable.
4. Preserve TypeScript strictness.
5. Add or update tests for behavior changes.
6. Run the applicable quality gates locally.
7. Do not commit secrets, generated credentials, or machine-specific configuration.

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository-specific contribution rules.

---

# Security Reporting

Do not disclose security vulnerabilities in public issues.

Follow the process in [SECURITY.md](SECURITY.md).

Security reports should include enough technical evidence to reproduce and validate the issue without exposing unnecessary sensitive information.

---

# License

Internet Resilience Platform is licensed under the [Apache License 2.0](LICENSE).

---

# Project Vision

The long-term vision is straightforward:

> **Build an Internet resilience system that understands connectivity as a continuously changing state, detects problems before users have to diagnose them manually, makes fast and explainable decisions locally, and verifies every recovery action.**

The project is not intended to hide complexity behind a superficial dashboard. It is intended to build the engineering machinery required to make unreliable connectivity **observable, diagnosable, recoverable, and measurable**.

```text
             Internet is changing continuously
                          │
                          ↓
                    Observe it
                          │
                          ↓
                    Understand it
                          │
                          ↓
                   Decide quickly
                          │
                          ↓
                  Recover safely
                          │
                          ↓
                    Verify result
                          │
                          ↓
                  Learn from history
                          │
                          └──────────────→ repeat
```

That is the purpose of the Internet Resilience Platform.

# Internet Resilience Platform

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E=24-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11.21.0-F69220.svg?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-000000.svg)](https://turborepo.com/)
[![Docker](https://img.shields.io/badge/Docker-supported-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com/)

**Internet Resilience Platform (IRP)** is an open-source TypeScript monorepo for measuring, diagnosing, and progressively automating recovery from unreliable network conditions.

The first production device target is the **IRP Linux Full Client on Debian-based Linux**, with Debian 13 (trixie) as the reference baseline. Linux is the release-critical device gate. macOS, Windows, iOS and Android remain additional platform targets with their own verification gates.

The governed loop is:

```text
Observe → Measure → Detect → Diagnose → Decide
        → Policy / Safety Check → Plan → Apply
        → Verify → Monitor → Failover / Recovery
        → Learn → Explain
```

## Current implementation truth

The repository is under active development. Phases **0–70** define the core implementation and hardening baseline. **Phase 71 — Cross-Platform Distribution & GitHub Releases** provides packaging and distribution work; it is no longer a global release blocker.

**Phases 72–150 are implemented locally** on branch `phase/94-150-implementation` (and integrated into `integration/full-cross-platform-completion`). This covers the full post-v1 roadmap from Unified Control Plane through Reliability, Scale & Disaster Recovery. All modules and phase documents exist on `main` and the integration branch; disposition is **PARTIAL** pending exact-SHA CI evidence and external runtime verification. No new runtime authority was introduced — `@irp/resilience-runtime` remains the sole production mutation authority.

The post-v1 roadmap is governed by [`docs/roadmap/MASTER_ROADMAP_V2.md`](docs/roadmap/MASTER_ROADMAP_V2.md). Phase 72 is **Control-Plane Architecture Completion**, not signed mobile distribution. Architecture work proceeds independently of release publication.

The Linux primary-device contract is explicit: the Debian-based Linux client is the first device release target, and its build, test, package and runtime gates are release-critical. iOS build failures remain visible and are not suppressed, but they do not block Linux-first delivery.

A capability is not considered production-ready merely because source code exists; it must pass the applicable validation, test, build, runtime, security, device and integration gates.

## Phase implementation status (verified locally)

| Phase Group | Phases | Status | Key Deliverables |
|-------------|--------|--------|------------------|
| Foundation & Engineering | 0–7 | ✅ Merged | Core packages, config, logging, events |
| Network Intelligence & Resilience | 8–18 | ✅ Merged | DNS, routing, failover, network intelligence |
| Extensibility & Access Providers | 19–27 | ✅ Merged | Plugin system, tunnel, gateway registry |
| Learning, Analytics & Observability | 28–38 | ✅ Merged | Historical analysis, metrics, telemetry |
| Secure Client & Distributed Evidence | 39–45 | ✅ Merged | Device identity, security, federation |
| Gateway, Tunnel & Multi-Path | 46–55 | ✅ Merged | Gateway lifecycle, multi-path, egress |
| Unified Control Plane & Product UI | 56–60 | ✅ Merged | API, unified product, web control center |
| Linux/macOS/Windows Full Clients | 61–63 | ✅ Integrated | Real FFI bindings, HTTP control plane |
| iOS/Android Full Clients | 64–68 | ✅ Integrated | Swift/Kotlin HTTP clients, enrollment |
| Production Hardening & v1.0 Cert | 69–70 | ✅ Merged | Certification contract, release pipeline |
| Cross-Platform Distribution | 71 | ✅ Merged | GitHub Releases, packaging, checksums |
| **Unified Control Plane** | **72–78** | **✅ Local (PARTIAL)** | **State model, contracts, decision orchestration, transactions, safety kernel, closed-loop** |
| **Intent & Policy** | **79–85** | **✅ Local (PARTIAL)** | **Intent model, API, compilation, governance, conflict resolution, drift** |
| **Connectivity Fabric** | **86–92** | **✅ Local (PARTIAL)** | **Fabric, multi-interface, multi-path, gateway, DNS/tunnel/proxy, app-aware, assurance** |
| **Advanced Routing & Recovery** | **93–99** | **✅ Local (PARTIAL)** | **Advanced routing, traffic classification, PBR, dynamic optimization, predictive failover** |
| **Telemetry & Intelligence** | **100–106** | **✅ Local (PARTIAL)** | **Unified telemetry plane, streaming, correlation, topology, historical, anomaly, closed-loop** |
| **Security & Trust** | **107–113** | **✅ Local (PARTIAL)** | **Secure control plane, device identity, capabilities, secrets, agent protocol, monitoring** |
| **Fleet & Distributed Control** | **114–120** | **✅ Local (PARTIAL)** | **Fleet management, enrollment, config distribution, coordination, orchestration, tenant isolation, health** |
| **Intelligence, Simulation & Production** | **121–127** | **✅ Local (PARTIAL)** | **Knowledge base, prediction, AI assistance, autonomous optimization, digital twin, chaos validation, final certification** |
| **Data Plane & Traffic Engineering** | **128–134** | **✅ Local (PARTIAL)** | **Data-plane abstraction, flow lifecycle, QoS, app policy, address/session mgmt, NAT/firewall, reconciliation** |
| **Platform APIs & Extensibility** | **135–140** | **✅ Local (PARTIAL)** | **Versioned API, event bus, plugin governance, capability discovery, external integrations, migration** |
| **Privacy, Governance & Compliance** | **141–145** | **✅ Local (PARTIAL)** | **Privacy-preserving telemetry, data classification, auditability, governance controls, compliance** |
| **Reliability, Scale & DR** | **146–150** | **✅ Local (PARTIAL)** | **Control-plane HA, distributed consistency, horizontal scale, backup/DR, global readiness** |

See [`ROADMAP.md`](ROADMAP.md) for the concise roadmap and [`docs/roadmap/MASTER_ROADMAP_V2.md`](docs/roadmap/MASTER_ROADMAP_V2.md) for the current Phase 72–150 planning authority. The former distribution document is explicitly archived and must not be used as current phase numbering.

## Downloads

Published client artifacts are distributed through **[GitHub Releases](https://github.com/NahiraDev/InternetResiliencePlatform/releases)**. The canonical platform-specific guide is [`docs/downloads.md`](docs/downloads.md). Linux is the first production device artifact; iOS remains a source/developer bundle until signing and provisioning are configured.

## What exists today (verified locally)

The current repository includes:

### Core Platform (merged on `main`)
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
- Linux Full Client package with systemd integration, local diagnostics and Debian package generation
- Platform client foundations for macOS, Windows, the shared mobile core, iOS Full Client and native iOS Network Extension boundaries
- A machine-readable Phase 70 v1.0 certification contract and fail-closed evidence verifier
- A cross-platform GitHub Release pipeline with packaging smoke checks and SHA-256 checksums

### Cross-Platform Integration (integrated on `integration/full-cross-platform-completion`)
- **Web Control Center**: Real API-connected dashboard at `/web/*` with auth, platform status, zero-cost mode, runtime policies/cycles/decisions/incidents
- **macOS Client**: Real HTTP control plane transport with SystemConfiguration FFI bindings, Keychain storage, interface/route/gateway/DNS discovery, reachability monitoring, privilege detection
- **Windows Client**: Real HTTP control plane transport with IP Helper API (iphlpapi.dll) FFI bindings, Credential Manager storage, interface/route/gateway/DNS discovery, transactional route apply→verify→rollback, privilege detection
- **iOS Client**: Swift HTTP client with URLSession, Keychain storage, enrollment flow, Info.plist configuration (fail-closed, HTTPS required in production)
- **Android Client**: Kotlin HTTP client with HttpURLConnection, Android KeyStore, enrollment flow, strings.xml configuration (fail-closed)
- **Device Enrollment Flow**: User-initiated request → Admin approval → Device credentials → Token exchange (access 15min, refresh 30days)
- **Zero-Cost Personal Mode**: Cost metadata on ConnectivityResource, `/api/v1/platform/zero-cost` endpoints, web UI filter

### Post-v1 Architecture (Phases 72–150, implemented locally, PARTIAL pending CI evidence)
- **Canonical ResilienceRuntime**: Sole production orchestration authority with canonical composition factory
- **Unified Control Plane**: State model, typed contracts, decision orchestration, transactional action engine, safety/rollback/recovery kernel, bounded closed-loop
- **Intent & Policy**: Intent model/lifecycle, API ingestion, pure compilation, governance admission, conflict resolution (priority/version supersession), drift detection
- **Connectivity Fabric**: Unified resource model (Device/Interface/Link/Route/Gateway/Provider/DNS/Tunnel/Transport/Proxy/Egress/RemoteNode/Region/Destination/Service/Endpoint/Application/Workload/Path), multi-interface/path/gateway/DNS/tunnel/proxy intelligence, application-aware path selection, connectivity service assurance
- **Advanced Routing & Recovery**: Advanced routing control, traffic classification, policy-based routing, dynamic optimization, service reachability, congestion awareness, predictive failover
- **Telemetry & Intelligence**: Unified telemetry plane, streaming metrics/events, cross-layer correlation, topology/dependency intelligence, historical time-series, anomaly detection, telemetry-driven assurance
- **Security & Trust**: Secure control plane architecture, device identity/enrollment, capability-based authorization, secrets/key lifecycle, agent protocol, security policy enforcement, monitoring/response
- **Fleet & Distributed Control**: Fleet management, device enrollment/lifecycle, remote config/policy distribution, distributed coordination, multi-device orchestration, tenant isolation, fleet health
- **Intelligence, Simulation & Production**: Network knowledge base, state prediction, AI assistance (advisory only), autonomous optimization, digital twin/simulation, chaos/HIL validation, final production certification
- **Data Plane & Traffic Engineering**: Data-plane abstraction/enforcement, flow/connection lifecycle, QoS/priority/traffic engineering, app/service policy enforcement, address/session management, NAT/firewall integration, safe reconciliation
- **Platform APIs & Extensibility**: Versioned control-plane API, event bus, plugin/provider lifecycle, capability discovery/registry, external integrations/webhooks/SDK, compatibility/migration framework
- **Privacy, Governance & Compliance**: Privacy-preserving telemetry, data classification/retention/deletion, auditability/immutable control history, governance controls, compliance evidence framework
- **Reliability, Scale & Disaster Recovery**: Control-plane HA, distributed state consistency/conflict recovery, horizontal scale/backpressure, backup/DR/regional recovery, global platform readiness

### Persistence (resolved on `main` per #410/#411)
- **PostgreSQL-backed stores**: `PostgresDecisionStore` and `PostgresIncidentStore` with full ACID guarantees, schema migrations, and health reporting
- **Daemon integration**: Uses PostgreSQL stores when `DATABASE_URL` is configured, falling back to file stores, then in-memory
- **CI support**: PostgreSQL service with `IRP_TEST_DATABASE_URL` in GitHub Actions

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
10. [Running the daemon on Linux](docs/operations/running-the-daemon.md) and [platform verification status](docs/operations/platform-verification.md)
11. [Linux primary device contract](docs/release/linux-primary-platform.md)

### For maintainers

- [Documentation index](docs/README.md)
- [Architecture documentation](docs/architecture/README.md)
- [Superplatform Reference Architecture](docs/architecture/IRP-SUPERPLATFORM-REFERENCE-ARCHITECTURE.md) — **canonical contract**
- [Product architecture](docs/architecture/product-architecture.md)
- [70-phase product plan](docs/architecture/product-roadmap-70-phases.md) — historical reference
- [Current roadmap V2](docs/roadmap/MASTER_ROADMAP_V2.md) — **current planning authority**
- [Control-plane ownership contract](docs/architecture/control-plane-ownership.md)
- [Phase 72 downstream dependency contract](docs/architecture/control-plane-phase72-dependencies.md)
- [Archived distribution roadmap](docs/architecture/post-v1-distribution-roadmap.md)
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
- Debian-based Linux for the primary device runtime

From the repository root:

```bash
pnpm install
pnpm validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm examples:smoke
pnpm --filter @irp/linux-client test
pnpm linux:package
```

The deterministic smoke suite runs local examples and does not mutate host networking. API examples require the normal API service to be running; see [`examples/README.md`](examples/README.md).

## Repository layout

```text
apps/                       Application entry points
  api/                      Fastify API server (management interface)
  daemon/                   Background daemon (Linux host)
  web/                      Web Control Center (served by API at /web/*)
  cli/                      CLI tool (Unix socket to daemon)
packages/                   Reusable IRP packages
  resilience-runtime/       Canonical orchestration authority (production mutation)
  connectivity/             Connectivity resource model & fabric
  routing/                  Routing engine & contracts
  gateway-registry/         Gateway lifecycle & selection
  tunnel/                   Tunnel lifecycle
  dns/                      DNS domain & catalog
  network-intelligence/     Measurements, correlation, prediction
  historical-analysis/      Historical evidence & advisory
  failover/                 Failover & recovery primitives
  security/                 Security/trust boundaries
  telemetry/                Telemetry & metrics
  linux-client/             Debian/Linux Full Client (production data plane)
  macos-client/             macOS client (SystemConfiguration FFI, Keychain)
  windows-client/           Windows client (IP Helper FFI, Credential Manager)
  daemon/                   Daemon host composition
  database/                 PostgreSQL stores (Decision, Incident)
  auth/                     Authentication & authorization
  ...                       40+ additional packages
clients/ios/                Native iOS Full Client & Network Extension
clients/android/            Native Android Full Client
examples/                   Capability-oriented runnable examples
ops/                        Operational, release and deployment contracts
scripts/                    Repository validation and automation
docs/                       Product, architecture, phase and operational documentation
```

## Validation gates (all passing locally)

```bash
pnpm validate              # Repository structure, 44 packages, 16 workflows, 2276 files
pnpm validate:docs         # 237 Markdown/MDX files
pnpm architecture:check    # Architecture contract enforcement
pnpm architecture:test     # Architecture invariant tests
pnpm runtime:integration:strict  # Package integration (44 packages)
pnpm certification:test    # Production certification + full-system assurance tests
pnpm test                  # 2,833+ tests across 44 packages
```

## Evidence classification

| Capability | Evidence Level | Notes |
|------------|----------------|-------|
| Core packages (0–70) | ✅ Local tests + architecture check | Merged on `main` |
| Cross-platform clients | ✅ Local tests + typecheck + architecture | Integrated on `integration/full-cross-platform-completion` |
| PostgreSQL stores | ✅ Local tests (mocked pool) + typecheck | Resolved #410/#411; CI runs with PostgreSQL service |
| Phases 72–150 modules | ✅ Local tests (972 resilience-runtime) | PARTIAL — exact-SHA CI evidence pending |
| Linux runtime soak | ❌ External blocker | Requires physical/virtual Linux with CAP_NET_ADMIN (#254/#323) |
| iOS/Android native build | ❌ External blocker | Requires Xcode/Gradle/Android SDK (no local runner) |
| Windows/macOS native runtime | ❌ External blocker | Requires Windows/macOS CI runner |
| Production certification | ⏳ PENDING | No live runtime evidence supplied; full-system assurance BLOCKED |
| CodeQL workflow | ❌ Config conflict | Default vs advanced setup conflict (#420) |

## Architecture invariants (enforced by CI)

1. `@irp/resilience-runtime` is the **sole production orchestration authority**
2. Hosts use **canonical runtime composition** (`createCanonicalRuntime`)
3. No client/API/plugin **bypasses safety** for privileged mutation
4. **AI cannot directly mutate** network state (advisory only)
5. Legacy `NetworkAutopilot` **cannot regain** production authority
6. Important mutations have **verification**; failed mutations have **rollback/recovery**
7. Decisions are **stale-state protected**
8. Remote evidence **cannot silently become authority**
9. Federation outage **does not disable** local control
10. Intent compilation **does not itself mutate**
11. **Governance upstream** of privileged execution
12. **No duplicate** decision/policy/state/transaction authorities
13. Autonomous behavior is **observable**
14. Documentation **cannot claim implemented behavior** without source/runtime evidence

## License

Apache-2.0 — see [LICENSE](LICENSE) for details.
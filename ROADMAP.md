# InternetResiliencePlatform — Product Roadmap

> A production-grade, core-first Network Resilience Platform with one shared control plane and full-capability clients across Linux, macOS, Windows, iOS and Android.

## Product direction

IRP keeps the network intelligence and safety-critical decisioning in shared, headless Core services. Clients are presentation/platform adapters; they do not fork routing logic.

The product loop is:

```text
Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check
→ Apply → Verify → Monitor → Failover/Recover → Learn → Explain
```

### Product principles

- Core-first and headless.
- Full Client on Desktop and Mobile; mobile is not a dashboard-only remote viewer.
- One capability model and one authorization model across clients.
- Platform-native networking where the OS requires it.
- Provider/tunnel agnostic; no hard dependency on one vendor or protocol.
- Destination-aware policy and explicit network identity/egress evidence.
- No routing decision based on ping alone.
- All autonomous changes are bounded, observable, reversible and auditable.
- No raw payload collection for analytics.
- Production completion requires repository verification and runtime evidence, not merely source files.

## 70-phase product roadmap

### Foundation & Engineering — 0–7

- **Phase 0 — Bootstrap:** monorepo, package graph, tooling and baseline CI.
- **Phase 1 — Core Infrastructure:** configuration, logging, errors, dependency injection and lifecycle.
- **Phase 2 — Quality Infrastructure:** tests, coverage, linting, type safety and repository validation.
- **Phase 3 — CI/CD:** reproducible build, verification, artifact and release pipelines.
- **Phase 4 — Core Architecture:** module boundaries, contracts, events and dependency rules.
- **Phase 5 — Shared Services:** scheduling, retry/backoff, caching, feature flags and bounded concurrency.
- **Phase 6 — Network Foundation:** OS abstractions, sockets, HTTP, ICMP and network state primitives.
- **Phase 7 — Network Intelligence Core:** continuous measurements, benchmarks and canonical evidence.

### Network Intelligence & Resilience — 8–18

- **Phase 8 — Smart DNS Engine:** resolver selection, health, fallback and cache behavior.
- **Phase 9 — Connectivity Detection:** multi-source state detection and transition classification.
- **Phase 10 — Routing Engine:** per-destination/service route representation and dynamic switching.
- **Phase 11 — Rule & Policy Engine:** declarative policy evaluation and safety constraints.
- **Phase 12 — Connectivity Manager:** provider orchestration, scoring, safe switching and recovery.
- **Phase 13 — Intelligent Path Selection:** multi-dimensional candidate ranking, apply, verify and rollback.
- **Phase 14 — Resolver Intelligence:** DNS anomaly detection, health-aware orchestration and explainability.
- **Phase 15 — Network Diagnostics:** path analysis, MTU, DNS/TCP/TLS/HTTP diagnostics.
- **Phase 16 — Auto Failover & Recovery:** failure correlation, recovery plans, budgets, circuit breakers and rollback.
- **Phase 17 — Service Profiles:** destination/service-specific resilience policies.
- **Phase 18 — Workspace Profiles:** workload/context-aware policy activation.

### Extensibility & Access Providers — 19–27

- **Phase 19 — Plugin SDK:** stable provider and extension contracts.
- **Phase 20 — Plugin Registry:** discovery, signing, compatibility and lifecycle management.
- **Phase 21 — Connectivity Integrations:** first-party integrations for supported network backends.
- **Phase 22 — Headless Access Agent:** long-running autonomous local agent.
- **Phase 23 — Adaptive Route Orchestrator:** continuous scoring, switching and anti-flapping.
- **Phase 24 — Destination Classification:** geo-aware and destination-aware policy without hard-coded global routing.
- **Phase 25 — Application Verification:** service-level DNS/TCP/TLS/HTTP verification and failure classification.
- **Phase 26 — Secure Control Plane:** authenticated API for state, policy, diagnostics and controlled commands.
- **Phase 27 — Runtime Productionization:** non-root operation, readiness, health checks, deterministic images and runtime verification.

### Learning, Analytics & Observability — 28–38

- **Phase 28 — Historical Performance Store:** route/provider/destination observations.
- **Phase 29 — Time-Aware Performance Model:** hourly/daily degradation models.
- **Phase 30 — Predictive Decision Engine:** bounded pre-emptive decisions with confidence thresholds.
- **Phase 31 — Automatic Optimization:** safe autonomous provider/path optimization.
- **Phase 32 — Decision Explainability & Audit:** evidence-backed decision explanations.
- **Phase 33 — Resilience Benchmarking:** comparative provider/path/policy evaluation.
- **Phase 34 — Metrics Platform:** canonical internal telemetry model.
- **Phase 35 — OpenTelemetry:** standardized trace and metric export contracts.
- **Phase 36 — OTel Runtime Integration:** Node SDK lifecycle, OTLP exporters, resource identity and sampling.
- **Phase 37 — Prometheus Integration:** canonical metrics exposition and bounded cardinality.
- **Phase 38 — Operational Diagnostics:** machine-readable operational reports and automation hooks.

### Secure Client & Distributed Evidence — 39–45

- **Phase 39 — Device Identity & Remote Client Security:** reusable device credentials, rotating sessions and scoped authorization.
- **Phase 40 — End-to-End Resilience Validation:** controlled-fault validation of Observe→Recover.
- **Phase 41 — External Regional Validation:** independently verifiable public-IP and service evidence from regional vantage points.
- **Phase 42 — Remote Client API Integration:** production Fastify lifecycle for enrollment, token rotation and authorization.
- **Phase 43 — Distributed Probe Federation:** signed evidence, replay protection, revocation, bounded ingestion and regional comparison.
- **Phase 44 — Data Analytics & Decision Intelligence:** summaries, percentiles, trends, confidence, anomalies and export over historical/federated evidence.
- **Phase 45 — Network Identity & Destination Policy Assurance:** explicit egress identity, destination identity and policy enforcement.

### Gateway, Tunnel & Multi-Path Platform — 46–55

- **Phase 46 — Gateway Registry:** managed gateway inventory, metadata, ownership and lifecycle.
- **Phase 47 — Gateway Discovery & Health:** discovery, reachability, quality scoring and stale-gateway handling.
- **Phase 48 — Secure Tunnel Abstraction:** provider-neutral tunnel lifecycle contract.
- **Phase 49 — WireGuard Provider:** production provider adapter with key lifecycle and health verification.
- **Phase 50 — Additional Tunnel Providers:** pluggable support for other supported, legitimate network backends.
- **Phase 51 — Automatic Gateway Selection:** policy-aware selection using latency, loss, stability, capacity and regional evidence.
- **Phase 52 — Tunnel Lifecycle Automation:** establish, verify, maintain, rotate, reconnect and safely tear down tunnels.
- **Phase 53 — Multi-Gateway Failover:** health-aware failover, cooldowns, hysteresis and recovery budgets.
- **Phase 54 — Gateway Fleet Operations:** provisioning metadata, upgrades, drain/disable, maintenance and capacity management.
- **Phase 55 — Gateway Security & Compliance:** key protection, least privilege, hardening, auditability and supply-chain verification.

### Unified Control Plane & Product UI — 56–60

- **Phase 56 — Unified Product API:** one versioned capability API for all clients.
- **Phase 57 — Web Control Center:** dashboard, devices, gateways, policies, routes, tunnels, analytics, diagnostics and audit.
- **Phase 58 — Identity, RBAC & Multi-Device Sync:** users, devices, roles, sessions, policy synchronization and conflict handling.
- **Phase 59 — Notifications & Incident Center:** alerts, degradation events, recovery events and actionable diagnostics.
- **Phase 60 — Administration & Self-Hosting:** control-plane deployment, configuration, backups, migrations and operator tooling.

### Desktop Full Clients — 61–63

- **Phase 61 — Linux Full Client:** native/system integration, background agent, tray/UI, diagnostics and policy controls.
- **Phase 62 — macOS Full Client:** native integration, system networking hooks, background lifecycle and diagnostics.
- **Phase 63 — Windows Full Client:** native integration, service lifecycle, networking hooks and diagnostics.

### Mobile Full Clients — 64–68

- **Phase 64 — Shared Mobile Client Core:** shared capability contracts, secure storage, sync, offline state and API lifecycle.
- **Phase 65 — iOS Full Client:** native UI, device enrollment, all shared analytics/policy capabilities and platform security.
- **Phase 66 — iOS Network Integration:** Network Extension-based system networking integration where permitted by Apple platform APIs.
- **Phase 67 — Android Full Client:** native UI, secure storage, device lifecycle, all shared analytics/policy capabilities and platform security.
- **Phase 68 — Android VPN/Network Integration:** Android-native networking integration, lifecycle, health and failover behavior.

### Production & Certification — 69–70

- **Phase 69 — Cross-Platform Production Hardening:** performance, accessibility, localization, upgrade/rollback, security audit, compatibility matrix, chaos/soak, backup/restore and release engineering.
- **Phase 70 — IRP v1.0 Production Certification:** end-to-end certification across Core, API, gateways, web, Linux, macOS, Windows, iOS and Android, with SLOs, security gates, recovery proof, regional evidence and continuous verification.

## Release gates

### Gate A — Core usable

After the foundational/resilience work is verified, the headless agent must be able to measure, diagnose, select, apply, verify and recover a path safely.

### Gate B — Personal production

The platform must have a real gateway/tunnel lifecycle, secure device identity, autonomous failover and production-grade runtime behavior before it is considered suitable for continuous personal operation.

### Gate C — Multi-device production

Web, Linux, macOS, Windows, iOS and Android must consume the same capability contracts. Mobile is a **Full Client**, not a remote read-only dashboard.

### Gate D — v1.0

Phase 70 requires all supported platforms and deployment modes to pass security, reliability, upgrade, recovery, observability and end-to-end certification gates.

## Mobile architectural contract

```text
                    IRP Core / Control Plane
                              |
              +---------------+---------------+
              |               |               |
           Web API        Desktop API      Mobile API
              |               |               |
        Web Control      Full Client      Full Client
                              |               |
                    +---------+---------+
                    |                   |
                   iOS               Android
                    |                   |
             Native Network      Native Network
               Integration          Integration
```

The same Core capability must be exposed to Desktop and Mobile wherever the platform permits it. Platform-specific restrictions are isolated behind adapters; routing/policy logic is never duplicated in the UI.

## Gateway/tunnel contract

IRP treats gateways and tunnels as managed network providers. A provider is only eligible after authentication, capability checks, health verification and policy evaluation. The platform must not silently assume that a particular IP location implies a particular service capability; egress identity and service reachability are measured independently.

## Definition of done for every phase

1. Existing implementation and contracts are inspected before adding new abstractions.
2. Acceptance criteria are documented.
3. Unit/integration tests cover normal, boundary, invalid and failure cases.
4. `pnpm validate`, `pnpm typecheck`, `pnpm lint`, relevant tests and builds pass.
5. Security-sensitive changes receive explicit threat/abuse review.
6. Runtime behavior is verified when the phase touches processes, containers, networking or platform integration.
7. Documentation and project state are updated.
8. CI is green before the phase is marked complete.

## Current implementation truth

The canonical implementation boundary is now **Phase 59 — Notifications & Incident Center**, which has started on `phase/59-notifications-incident-center`. Phase 58 — Real Network Measurements has been merged to `main`; remaining verification evidence is still governed by the project-state verification rules. Phase 59 is intentionally not marked complete until its persistence, API, runtime integration, UI, tests and CI/runtime evidence satisfy the definition of done.

The previous roadmap's headless-only UI prohibition is superseded by this product roadmap: **UI and client work is now an explicit product track beginning at Phase 56, while Core remains headless and authoritative.**

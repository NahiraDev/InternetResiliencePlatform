# InternetResiliencePlatform — Core-First Roadmap

> A production-grade, headless network intelligence and adaptive internet access platform that continuously measures connectivity, diagnoses failures, selects the best eligible path per destination, and automatically recovers from degradation.

## Product Direction

InternetResiliencePlatform is **core-first and headless**. The product is not a dashboard, Electron application, or VPN switcher. Its primary responsibility is to make network access reliable without requiring the user to manually choose routes or troubleshoot connectivity.

The core agent continuously:

```text
Observe → Measure → Detect → Diagnose → Decide → Policy/Safety Check
→ Apply → Verify → Monitor → Failover/Recover → Learn
```

## Non-goals

- No desktop dashboard.
- No Electron UI.
- No mobile dashboard UI.
- No global on/off VPN model as the core abstraction.
- No route selection based on ping alone.

## Required capabilities

- Per-destination/per-service path selection.
- Direct and alternate connectivity providers through stable plugin interfaces.
- Destination-aware policy, including preservation of connectivity requirements such as Iran-only services.
- Application-level verification instead of relying on ICMP alone.
- Latency, jitter, packet loss, DNS, TCP, TLS, HTTP, throughput, stability and availability measurement.
- Historical and time-of-day performance modelling.
- Automatic failover, recovery, hysteresis, cooldown and anti-flapping safeguards.
- Explainable decisions and auditable route changes.
- Headless API/control plane for automation and clients.
- Mobile/remote clients through the control/data-plane interfaces; UI is not a core deliverable.
- Production-grade security, sandboxing, policy enforcement and rollback.
- External/regional validation from independent network vantage points.

## Roadmap Overview — 48 Phases

| Section | Phases | Goal |
| --- | --- | --- |
| Foundation | 0–7 | Core architecture, quality, runtime and network primitives |
| Measurement & Intelligence | 8–15 | DNS, connectivity detection, diagnostics and network intelligence |
| Resilience Core | 16–18 | Failover, profiles and policy-driven resilience |
| Extensibility | 19–21 | Plugin SDK and connectivity-provider integrations |
| Adaptive Access | 22–27 | Headless agent, route orchestration and secure control plane |
| Learning & Optimization | 28–33 | Historical modelling, prediction and optimization |
| Observability | 34–38 | Metrics, OpenTelemetry, Prometheus and diagnostics |
| Client & Validation | 39–41 | Remote-client security and deterministic/external validation |
| Distributed Resilience | 42–45 | Remote-client integration, regional probes, destination policy and adaptive learning |
| Production Certification | 46–48 | Long-duration resilience, production release and continuous certification |

## Phase Map

### Foundation — 0–7

- **Phase 0 — Bootstrap:** monorepo, tooling and baseline CI.
- **Phase 1 — Core Infrastructure:** configuration, logging, errors and dependency injection.
- **Phase 2 — Quality & Testing:** unit/integration/coverage infrastructure and CI gates.
- **Phase 3 — CI/CD:** reproducible build, test and release pipelines.
- **Phase 4 — Core Architecture:** enforceable module boundaries, contracts and event model.
- **Phase 5 — Shared Services:** scheduling, retry/backoff, caching and feature flags.
- **Phase 6 — Network Foundation:** sockets, HTTP/ICMP and OS network abstractions.
- **Phase 7 — Network Intelligence Core:** continuous measurement and benchmark primitives.

### Measurement & Intelligence — 8–15

- **Phase 8 — Smart DNS Engine:** per-domain resolver selection, health and fallback.
- **Phase 9 — Advanced Connectivity Detection:** multi-source and state-change detection.
- **Phase 10 — Routing Engine:** per-service route tables and dynamic switching.
- **Phase 11 — Rule Engine:** declarative, policy-aware decision rules.
- **Phase 12 — Multi-Source Connectivity Manager:** provider orchestration, scoring, safe switching and recovery.
- **Phase 13 — Intelligent Routing & Path Selection:** policy-aware candidate selection, application, verification and rollback.
- **Phase 14 — Resolver Intelligence:** health-aware DNS orchestration, cache, anomaly detection and explainability.
- **Phase 15 — Network Diagnostics:** path analysis, MTU and connectivity diagnostics.

### Resilience Core — 16–18

- **Phase 16 — Auto Failover & Recovery:** correlated failure detection, recovery plans, budgets, circuit breakers and rollback.
- **Phase 17 — Service Profiles:** destination/service-specific policy profiles.
- **Phase 18 — Workspace Profiles:** automatic policy activation by workload/context.

### Extensibility — 19–21

- **Phase 19 — Plugin SDK:** stable provider and extension contracts.
- **Phase 20 — Plugin Registry/Marketplace:** discovery, signing and lifecycle.
- **Phase 21 — Connectivity Integrations:** first-party integrations for supported network/tunnel/proxy backends.

### Adaptive Access — 22–27

- **Phase 22 — Headless Access Agent:** long-running local agent responsible for autonomous network decisions.
- **Phase 23 — Adaptive Route Orchestrator:** continuous path scoring, switching, verification and anti-flapping.
- **Phase 24 — Destination Classification & Geo-Aware Policy:** distinguish direct, alternate and location-sensitive destinations without hard-coding a single global route.
- **Phase 25 — Application Connectivity Verification:** DNS/TCP/TLS/HTTP/service-level verification and failure classification.
- **Phase 26 — Secure Control Plane:** authenticated API for status, policy, diagnostics and controlled agent commands.
- **Phase 27 — Runtime & Container Productionization:** non-root operation, dependency closure, startup readiness, health checks, deterministic images and runtime verification.

### Learning & Optimization — 28–33

- **Phase 28 — Historical Performance Store:** retain route/provider/destination observations.
- **Phase 29 — Time-Aware Performance Model:** learn hourly/daily degradation patterns.
- **Phase 30 — Predictive Decision Engine:** pre-empt degradation when confidence is sufficient.
- **Phase 31 — Automatic Optimization:** bounded autonomous route/provider optimization.
- **Phase 32 — Decision Explainability & Audit:** explain why a route was selected and what evidence supported it.
- **Phase 33 — Resilience Benchmarking:** continuous comparative evaluation of providers, routes and policies.

### Observability — 34–38

- **Phase 34 — Metrics Platform:** canonical internal telemetry model.
- **Phase 35 — OpenTelemetry:** standardized traces and metric export.
- **Phase 36 — OpenTelemetry Runtime Integration:** production Node SDK lifecycle, OTLP exporters, resource identity and sampling.
- **Phase 37 — Prometheus Integration:** canonical metrics bridge, standard scrape exposition and bounded label/cardinality semantics.
- **Phase 38 — Operational Diagnostics:** machine-readable operational reports and automation hooks.

### Client & Validation — 39–41

- **Phase 39 — Remote/Mobile Client Connectivity & Security Hardening:** reusable device credentials, rotating refresh tokens, bounded remote-client scopes and security audit primitives.
- **Phase 40 — End-to-End Internet Resilience Validation:** deterministic validation of the full Observe→Measure→Decide→Apply→Verify→Recover loop under controlled faults.
- **Phase 41 — External Regional Validation:** online public-IP identity checks and externally observed service/connectivity validation from independent regional vantage points, with explicit Iran/IR validation support.

### Distributed Resilience — 42–45

- **Phase 42 — Remote Client API Integration:** wire Phase 39 device credentials and rotating refresh sessions into the real Fastify authentication lifecycle and remote-client authorization boundary.
- **Phase 43 — Distributed Probe Federation:** register independent regional probes, collect bounded signed evidence and compare observations across vantage points.
- **Phase 44 — Destination Policy & Network Identity Assurance:** strengthen destination-specific geo/policy evaluation, direct/local identity preservation and evidence-based policy enforcement.
- **Phase 45 — Adaptive Provider Learning:** combine historical, regional and destination evidence into bounded provider/path learning and confidence updates.

### Production Certification — 46–48

- **Phase 46 — Long-Duration Chaos & Soak Validation:** multi-hour/day resilience validation, fault injection, anti-flapping, recovery budgets, memory/resource stability and state convergence.
- **Phase 47 — Production Release & Upgrade Safety:** release artifacts, migrations, compatibility guarantees, upgrade/rollback paths, supply-chain validation and deployment certification.
- **Phase 48 — v1.0 Continuous Resilience Certification:** final production certification with end-to-end evidence, regional validation, security gates, SLOs, recovery proof and continuous post-release validation.

## Phase 41 Online Regional Validation Contract

Regional validation must distinguish **where a probe is actually egressing** from where the GitHub runner, developer workstation or control plane is located.

The repository therefore supports:

```text
pnpm regional:online
```

By default the command queries an HTTPS public-IP/geolocation endpoint and prints machine-readable JSON. For an actual Iran-origin vantage point, set:

```text
IRP_REGIONAL_PROBE_URL=https://<trusted-iranian-probe>/identity
IRP_EXPECTED_COUNTRY=IR
pnpm regional:online
```

The remote probe must return JSON containing at least `ip` and `country` (or `country_code`). The command fails closed when the response cannot prove the expected country.

The public-IP lookup portion is based on standard public-IP/geolocation APIs that can return the request origin's IP and country. citeturn543801search0turn543801search2turn543801search7

## Definition of Success

v1.0 is successful only when the core agent can autonomously detect degraded destinations, identify failure class, evaluate eligible paths using multi-dimensional evidence, preserve destination policy, apply safely, verify service connectivity, recover without flapping, learn over time, expose secure headless control, and provide externally verifiable resilience evidence from independent regional vantage points.

## Repository Policy

The repository is intentionally **headless**. UI/Desktop work is removed from the product roadmap and implementation. Core network, agent, routing, policy, provider, verification, resilience, learning, security and runtime work takes priority over presentation layers.

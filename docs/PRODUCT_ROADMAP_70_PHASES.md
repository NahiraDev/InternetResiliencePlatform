# IRP 70-Phase Product Plan

This document is the detailed execution contract behind `ROADMAP.md`. `ROADMAP.md` remains the concise scope authority; this file defines dependencies, product surfaces, acceptance expectations, and release gates.

## Product target

IRP is a cross-platform Network Resilience Platform with one authoritative Core/Control Plane and full-capability clients on Linux, macOS, Windows, iOS, and Android.

Clients consume shared capability contracts. They do not duplicate routing, policy, safety, scoring, failover, or tunnel decision logic.

## Capability tracks

| Track | Phases | Outcome |
| --- | --- | --- |
| Foundation | 0–7 | stable core/runtime contracts |
| Network intelligence | 8–18 | measurement, diagnosis, routing and recovery |
| Extensibility/access | 19–27 | plugins, agent and controlled access orchestration |
| Learning/observability | 28–38 | historical intelligence and operational visibility |
| Security/federation | 39–45 | device trust, external evidence and policy assurance |
| Gateway/tunnel | 46–55 | managed gateways and provider-neutral tunnel lifecycle |
| Control plane/product | 56–60 | unified API, Web Control Center and self-hosting |
| Desktop | 61–63 | native full clients |
| Mobile | 64–68 | iOS/Android full clients and native networking adapters |
| Production | 69–70 | cross-platform hardening and v1.0 certification |

## Dependency model

```text
0–7 → 8–18 → 19–27 → 28–38 → 39–45
                              │
                              ├→ 46–55 → 56–60
                              │               │
                              └───────────────┼→ 61–68 → 69 → 70
```

A phase may be implemented in parallel only when its explicit dependency contracts already exist. Product UI must never become a hidden dependency for Core correctness.

## Phase contracts

| Phase | Contract | Primary acceptance |
| ---: | --- | --- |
| 0 | bootstrap | reproducible workspace + CI baseline |
| 1 | core infrastructure | lifecycle/config/logging contracts |
| 2 | quality | type/lint/test/validation baseline |
| 3 | CI/CD | reproducible verification and release pipeline |
| 4 | architecture | enforced module boundaries and contracts |
| 5 | shared services | bounded scheduling/retry/cache/concurrency |
| 6 | network foundation | portable network primitives |
| 7 | intelligence core | canonical bounded measurements |
| 8 | smart DNS | health-aware resolver selection/fallback |
| 9 | connectivity detection | multi-source state classification |
| 10 | routing | destination-aware route representation |
| 11 | policy | declarative policy + safety constraints |
| 12 | connectivity manager | provider orchestration and recovery |
| 13 | path selection | ranked candidates + apply/verify/rollback |
| 14 | resolver intelligence | DNS anomaly detection + explainability |
| 15 | diagnostics | DNS/TCP/TLS/HTTP/path/MTU diagnostics |
| 16 | failover | bounded recovery, circuit breakers and rollback |
| 17 | service profiles | service-specific resilience policies |
| 18 | workspace profiles | context-aware policy activation |
| 19 | plugin SDK | stable extension/provider contract |
| 20 | plugin registry | discovery, signing and compatibility |
| 21 | connectivity integrations | supported backend adapters |
| 22 | access agent | autonomous local runtime |
| 23 | route orchestrator | continuous scoring and anti-flapping |
| 24 | destination classification | destination-aware policy inputs |
| 25 | application verification | service-level reachability proof |
| 26 | secure control plane | authenticated controlled API |
| 27 | runtime productionization | non-root, health/readiness and deterministic runtime |
| 28 | historical store | route/provider/destination observations |
| 29 | time-aware model | temporal degradation baselines |
| 30 | predictive engine | bounded confidence-based pre-emption |
| 31 | auto optimization | policy-safe autonomous optimization |
| 32 | explainability/audit | evidence-backed decisions |
| 33 | benchmarking | comparative provider/path evaluation |
| 34 | metrics platform | canonical telemetry model |
| 35 | OpenTelemetry | standardized export contracts |
| 36 | OTel runtime | SDK lifecycle, OTLP and sampling |
| 37 | Prometheus | exposition and cardinality controls |
| 38 | operational diagnostics | machine-readable operational reports |
| 39 | device security | reusable device identity and scoped sessions |
| 40 | resilience validation | controlled-fault Observe→Recover proof |
| 41 | regional validation | independent regional egress/service evidence |
| 42 | remote client API | enrollment, rotation and authorization lifecycle |
| 43 | probe federation | signed, replay-resistant bounded evidence |
| 44 | data analytics | summaries, percentiles, trends and anomalies |
| 45 | network identity | egress identity + destination/policy assurance |
| 46 | gateway registry | owned/authorized gateway inventory |
| 47 | gateway discovery/health | discovery + quality scoring + stale handling |
| 48 | tunnel abstraction | provider-neutral lifecycle contract |
| 49 | WireGuard provider | production adapter + key lifecycle |
| 50 | additional providers | pluggable legitimate network backends |
| 51 | gateway selection | policy/health/capacity-aware selection |
| 52 | tunnel automation | establish/verify/maintain/rotate/reconnect/teardown |
| 53 | multi-gateway failover | hysteresis, cooldowns and recovery budgets |
| 54 | fleet operations | provisioning, maintenance, drain and capacity |
| 55 | gateway security | least privilege, key protection and supply chain |
| 56 | unified API | versioned capability contract for all clients |
| 57 | Web Control Center | dashboard, devices, gateways, policies, routes, tunnels, analytics and audit |
| 58 | identity/RBAC/sync | users, roles, sessions and conflict-safe sync |
| 59 | incident center | alerts, degradation/recovery events and diagnostics |
| 60 | administration/self-hosting | deployment, backups, migrations and operator tooling |
| 61 | Linux client | native integration + background agent + UI |
| 62 | macOS client | native integration + lifecycle + diagnostics |
| 63 | Windows client | service/network integration + diagnostics |
| 64 | mobile shared core | capability contracts, secure storage, sync/offline state |
| 65 | iOS full client | full shared capability surface + platform security |
| 66 | iOS network integration | Network Extension adapter where platform APIs permit |
| 67 | Android full client | full shared capability surface + platform security |
| 68 | Android network integration | Android-native VPN/network lifecycle and failover |
| 69 | production hardening | security, performance, accessibility, localization, upgrades, chaos/soak and release engineering |
| 70 | v1.0 certification | end-to-end cross-platform SLO/security/recovery certification |

## Universal Definition of Done

Every phase requires:

1. Existing code/contracts inspected before adding abstractions.
2. Explicit acceptance criteria and dependency record.
3. Unit/integration tests for normal, boundary, invalid and failure cases.
4. `pnpm validate`, `pnpm typecheck`, `pnpm lint`, relevant tests and builds passing.
5. Security/threat review for security-sensitive changes.
6. Runtime verification for networking/process/container/platform changes.
7. Documentation and project state synchronized.
8. CI green before marking the phase complete.

## Product-client contract

Desktop and Mobile are full clients. Web is the control surface. All clients use the same versioned capability model and authorization model. Native platform adapters may translate OS-specific networking primitives, but Core remains authoritative.

Required shared client capabilities, subject to OS permissions: enrollment, authentication, device/session state, network health, analytics, policies, service/workspace profiles, gateway/tunnel state, autopilot state, diagnostics, notifications and synchronized configuration.

## Gateway/tunnel contract

A gateway is an authorized network endpoint managed by IRP. A tunnel provider is an adapter behind the common tunnel lifecycle. Selection requires authentication, capability checks, health verification, policy evaluation and independent egress/service evidence. Geographic IP alone is never treated as proof of service availability.

## Release gates

### Gate A — Core usable
Measure → Diagnose → Decide → Policy/Safety → Apply → Verify → Recover works safely in a headless environment.

### Gate B — Personal production
Secure device identity, managed gateway/tunnel lifecycle, autonomous failover, rollback and runtime hardening are verified.

### Gate C — Multi-device production
Web, Linux, macOS, Windows, iOS and Android consume the same capability contracts; mobile is a Full Client.

### Gate D — v1.0
All supported clients and deployment modes pass security, reliability, upgrade, recovery, observability, compatibility and end-to-end certification.

## Current implementation boundary

The roadmap is 70 phases, but the implementation is not 70 phases complete. Current truth is Phase 43 federation implemented with verification gates remaining and Phase 44 analytics implementation present with final verification required. Dependent phases must not be marked complete until their acceptance and CI/runtime gates pass.

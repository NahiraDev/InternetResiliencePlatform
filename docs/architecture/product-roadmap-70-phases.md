# IRP 70-Phase Product Plan

## Authority

`ROADMAP.md` is the concise roadmap authority. This document is the detailed execution contract: tracks, dependencies, phase scope, acceptance expectations, and release gates.

The roadmap describes planned scope. It must never be used as evidence that a phase is implemented.

## Product target

IRP is a cross-platform Network Resilience Platform with one authoritative Core/Control Plane and full-capability clients on Linux, macOS, Windows, iOS, and Android.

## Capability tracks

| Track | Phases | Outcome |
| --- | --- | --- |
| Foundation | 0–7 | stable core/runtime contracts |
| Network intelligence | 8–18 | measurement, diagnosis, routing and recovery |
| Extensibility/access | 19–27 | plugins, agent and controlled access orchestration |
| Learning/observability | 28–38 | historical intelligence and operational visibility |
| Security/federation | 39–45 | device trust, external evidence and policy assurance |
| Gateway/tunnel | 46–55 | managed authorized gateways and provider-neutral tunnel lifecycle |
| Control plane/product | 56–60 | unified API, Web Control Center and self-hosting |
| Desktop | 61–63 | native full clients |
| Mobile | 64–68 | iOS/Android full clients and native networking adapters |
| Production | 69–70 | cross-platform hardening and v1.0 certification |

## Dependency model

```text
0–7 -> 8–18 -> 19–27 -> 28–38 -> 39–45
                              |
                              +-> 46–55 -> 56–60
                              |               |
                              +---------------+-> 61–68 -> 69 -> 70
```

Parallel implementation is allowed only when explicit dependency contracts already exist.

## Phase contract index

| Phase | Contract |
| ---: | --- |
| 0 | reproducible bootstrap and repository baseline |
| 1 | core infrastructure and lifecycle/config/logging contracts |
| 2 | quality, type, lint, test and validation baseline |
| 3 | reproducible CI/CD verification and release pipeline |
| 4 | architecture boundaries and module contracts |
| 5 | bounded shared scheduling/retry/cache/concurrency services |
| 6 | portable network primitives |
| 7 | canonical bounded network measurements |
| 8 | health-aware DNS selection and fallback |
| 9 | multi-source connectivity classification |
| 10 | destination-aware route representation |
| 11 | declarative policy and safety constraints |
| 12 | connectivity provider orchestration and recovery |
| 13 | ranked path candidates with apply/verify/rollback |
| 14 | DNS anomaly detection and explainability |
| 15 | DNS/TCP/TLS/HTTP/path/MTU diagnostics |
| 16 | bounded failover, circuit breakers and rollback |
| 17 | service-specific resilience policies |
| 18 | context-aware workspace policies |
| 19 | stable plugin SDK |
| 20 | plugin discovery, signing and compatibility |
| 21 | supported connectivity integrations |
| 22 | autonomous local access agent |
| 23 | continuous route scoring and anti-flapping |
| 24 | destination classification |
| 25 | service-level reachability verification |
| 26 | authenticated controlled API |
| 27 | production runtime hardening |
| 28 | historical observations |
| 29 | temporal degradation baselines |
| 30 | bounded predictive engine |
| 31 | policy-safe auto optimization |
| 32 | evidence-backed explainability and audit |
| 33 | provider/path benchmarking |
| 34 | canonical telemetry model |
| 35 | OpenTelemetry export contracts |
| 36 | OpenTelemetry runtime |
| 37 | Prometheus exposition and cardinality controls |
| 38 | operational diagnostics |
| 39 | device identity and scoped sessions |
| 40 | controlled-fault resilience validation |
| 41 | independent regional evidence |
| 42 | remote client enrollment and authorization lifecycle |
| 43 | signed replay-resistant probe federation |
| 44 | analytics summaries, trends and anomalies |
| 45 | egress identity and destination/policy assurance |
| 46 | authorized gateway inventory |
| 47 | gateway discovery, health and stale handling |
| 48 | provider-neutral tunnel lifecycle |
| 49 | WireGuard provider adapter |
| 50 | additional legitimate network provider adapters |
| 51 | policy/health/capacity-aware gateway selection |
| 52 | automated tunnel lifecycle |
| 53 | multi-gateway failover |
| 54 | gateway fleet operations |
| 55 | gateway security and supply-chain hardening |
| 56 | versioned unified capability API |
| 57 | Web Control Center |
| 58 | identity, RBAC and conflict-safe sync |
| 59 | incident center and diagnostics |
| 60 | administration, deployment, backups and migrations |
| 61 | Linux Full Client |
| 62 | macOS Full Client |
| 63 | Windows Full Client |
| 64 | shared mobile client core |
| 65 | iOS Full Client |
| 66 | iOS Network Extension integration |
| 67 | Android Full Client |
| 68 | Android-native VPN/network integration |
| 69 | cross-platform production hardening |
| 70 | end-to-end v1.0 certification |

## Universal Definition of Done

Every phase requires:

1. Existing implementation and contracts inspected before introducing abstractions.
2. Explicit acceptance criteria and dependency record.
3. Tests for normal, boundary, invalid, and failure behavior.
4. `pnpm validate`, `pnpm typecheck`, `pnpm lint`, relevant tests/builds passing.
5. Security/threat review for security-sensitive changes.
6. Runtime verification for networking, process, container, and platform changes.
7. Canonical documentation and `PROJECT_STATE.md` synchronized.
8. CI green before completion is claimed.

## Release gates

### Gate A — Core usable
Measure -> Diagnose -> Decide -> Policy/Safety -> Apply -> Verify -> Recover works safely headlessly.

### Gate B — Personal production
Device identity, authorized gateway/tunnel lifecycle, autonomous failover, rollback, and runtime hardening are verified.

### Gate C — Multi-device production
Web, Linux, macOS, Windows, iOS, and Android consume the same capability contracts; mobile remains a Full Client.

### Gate D — v1.0
Supported clients and deployment modes pass security, reliability, upgrade, recovery, observability, compatibility, and end-to-end certification.

## Current implementation boundary

The roadmap is 70 phases; implementation is not 70 phases complete. Current repository state must be taken from `PROJECT_STATE.md`, phase records, tests, runtime evidence, and CI. Planned behavior must remain explicitly labeled as planned.

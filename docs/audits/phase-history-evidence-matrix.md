# Historical Phase Evidence Matrix

**Date:** 2026-08-23  
**Status:** reconstruction in progress  
**Purpose:** preserve the real implementation history separately from the historical 70-phase product contract.

> **Scope note:** this matrix is intentionally limited to the historical/v1 0–70 baseline. It does not define current post-v1 planning or Phase 72–150 status. Use [`../../PROJECT_STATE.md`](../../PROJECT_STATE.md) for the current implementation gate and [`../roadmap/MASTER_ROADMAP_V2.md`](../roadmap/MASTER_ROADMAP_V2.md) for current post-70 planning.

## Why this matrix exists

The repository has undergone multiple roadmap/phase-numbering revisions. A historical implementation labeled "Phase 8" is **not automatically the current Phase 8**.

Therefore this matrix uses two independent identifiers:

- **Historical cluster:** the phase/feature label used by the repository at the time of implementation.
- **Current product phase:** the phase number in the canonical 70-phase roadmap.

A current phase receives a historical mapping only when source, tests, ADRs, merged changes and/or runtime evidence establish that relationship. A matching commit message alone is insufficient.

## Evidence states

| State | Meaning |
| --- | --- |
| `recorded` | A canonical current-phase record exists under `docs/phases/`. |
| `historical-evidence` | Implementation evidence exists, but the mapping to the current product phase is not yet fully reconstructed. |
| `mapped` | Historical evidence has been explicitly mapped to the current product phase with rationale and evidence anchors. |
| `verification-pending` | The current-phase implementation is present, but required repository/runtime/CI verification has not been re-established. |
| `planned` | Roadmap-only. No implementation claim is made. |

## Historical numbering drift

**historical numbering drift** is authoritative context for this matrix: historical implementation phase numbers drifted from the historical 70-phase product numbering. These labels must not be interpreted as one-to-one mappings. A historical phase number may have been renamed, split, merged, superseded, or moved into a later product track. The applicable roadmap is authoritative for its own scope.

## Prohibition on unverified historical completion claims

Historical evidence must never be represented as proof that a current product phase was completed. In particular, commit messages, old phase labels, file existence, or partial implementation evidence alone do not establish current completion.

Until that mapping is complete, historical implementation labels remain historical evidence only and must not be promoted to verified current-phase completion.

## Historical/v1 product-phase status

The table below preserves the 70-phase historical/v1 product contract. Current post-v1 planning is maintained separately in `docs/roadmap/MASTER_ROADMAP_V2.md`.

| Current phase | Product contract | Current evidence state | Canonical record |
| ---: | --- | --- | --- |
| 00 | Reproducible bootstrap and repository baseline | `recorded` | `docs/phases/phase-00.md` |
| 01 | Core infrastructure and lifecycle/config/logging contracts | `historical-evidence` | pending reconstruction |
| 02 | Quality, type, lint, test and validation baseline | `historical-evidence` | pending reconstruction |
| 03 | Reproducible CI/CD verification and release pipeline | `historical-evidence` | pending reconstruction |
| 04 | Architecture boundaries and module contracts | `historical-evidence` | pending reconstruction |
| 05 | Bounded shared scheduling/retry/cache/concurrency services | `historical-evidence` | pending reconstruction |
| 06 | Portable network primitives | `historical-evidence` | pending reconstruction |
| 07 | Canonical bounded network measurements | `historical-evidence` | pending reconstruction |
| 08 | Health-aware DNS selection and fallback | `historical-evidence` | pending reconstruction |
| 09 | Multi-source connectivity classification | `historical-evidence` | pending reconstruction |
| 10 | Destination-aware route representation | `historical-evidence` | pending reconstruction |
| 11 | Declarative policy and safety constraints | `historical-evidence` | pending reconstruction |
| 12 | Connectivity provider orchestration and recovery | `historical-evidence` | pending reconstruction |
| 13 | Ranked path candidates with apply/verify/rollback | `historical-evidence` | pending reconstruction |
| 14 | DNS anomaly detection and explainability | `historical-evidence` | pending reconstruction |
| 15 | DNS/TCP/TLS/HTTP/path/MTU diagnostics | `historical-evidence` | pending reconstruction |
| 16 | Bounded failover, circuit breakers and rollback | `historical-evidence` | pending reconstruction |
| 17 | Service-specific resilience policies | `historical-evidence` | pending reconstruction |
| 18 | Context-aware workspace policies | `historical-evidence` | pending reconstruction |
| 19 | Stable plugin SDK | `historical-evidence` | pending reconstruction |
| 20 | Plugin discovery, signing and compatibility | `historical-evidence` | pending reconstruction |
| 21 | Supported connectivity integrations | `historical-evidence` | pending reconstruction |
| 22 | Autonomous local access agent | `historical-evidence` | pending reconstruction |
| 23 | Continuous route scoring and anti-flapping | `historical-evidence` | pending reconstruction |
| 24 | Destination classification | `historical-evidence` | pending reconstruction |
| 25 | Service-level reachability verification | `historical-evidence` | pending reconstruction |
| 26 | Authenticated controlled API | `historical-evidence` | pending reconstruction |
| 27 | Production runtime hardening | `historical-evidence` | pending reconstruction |
| 28 | Historical observations | `historical-evidence` | pending reconstruction |
| 29 | Temporal degradation baselines | `historical-evidence` | pending reconstruction |
| 30 | Bounded predictive engine | `historical-evidence` | pending reconstruction |
| 31 | Policy-safe auto optimization | `historical-evidence` | pending reconstruction |
| 32 | Evidence-backed explainability and audit | `historical-evidence` | pending reconstruction |
| 33 | Provider/path benchmarking | `historical-evidence` | pending reconstruction |
| 34 | Canonical telemetry model | `historical-evidence` | pending reconstruction |
| 35 | OpenTelemetry export contracts | `historical-evidence` | pending reconstruction |
| 36 | OpenTelemetry runtime | `historical-evidence` | pending reconstruction |
| 37 | Prometheus exposition and cardinality controls | `historical-evidence` | pending reconstruction |
| 38 | Operational diagnostics | `historical-evidence` | pending reconstruction |
| 39 | Device identity and scoped sessions | `recorded` / verification pending | `docs/phases/phase-39.md` |
| 40 | Controlled-fault resilience validation | `recorded` / verification pending | `docs/phases/phase-40.md` + evidence |
| 41 | Independent regional evidence | `recorded` / external validation pending | `docs/phases/phase-41.md` |
| 42 | Remote client enrollment and authorization lifecycle | `recorded` / verification pending | `docs/phases/phase-42.md` |
| 43 | Signed replay-resistant probe federation | `recorded` / verification pending | `docs/phases/phase-43.md` |
| 44 | Analytics summaries, trends and anomalies | `recorded` / verification pending | `docs/phases/phase-44.md` |
| 45–70 | Historical/v1 roadmap contracts | `planned` unless a later phase explicitly starts | roadmap only |

## Historical implementation clusters currently confirmed

These are **historical labels**, not current product-phase assertions:

| Historical label | Evidence observed | Current mapping |
| --- | --- | --- |
| Phase 0 bootstrap | bootstrap merge and repository baseline | Phase 00 |
| Phase 1 monorepo foundation | monorepo foundation commit/merge | not yet mapped beyond foundation evidence |
| Phase 2 core runtime engine | implementation/merge history exists | not yet mapped; historical label conflicts with current Phase 02 contract |
| Phase 3 intelligent routing | implementation history exists | not yet mapped; historical label conflicts with current Phase 03 contract |
| Phase 4 core platform foundation | API/packages/Prisma/telemetry/docs merge exists | not yet mapped |
| Phase 5 core backend | auth/RBAC/DB/API implementation exists | not yet mapped |
| Phase 6 Network Intelligence Core | probes/monitoring/API/metrics/DB history exists | not yet mapped |
| Phase 8 security foundation | security implementation/merge exists | not current Phase 08 by number |
| Phase 9 plugin system | plugin/extension runtime history exists | not current Phase 09 by number |
| Phase 12 connectivity manager | connectivity manager implementation/merge exists | not current Phase 12 by number until reconciliation |
| Phase 13 path selection | routing/path-selection implementation/merge exists | not current Phase 13 by number until reconciliation |
| Phase 14 smart DNS | resolver implementation/merge exists | not current Phase 14 by number until reconciliation |
| Phase 15 secure DNS transport | implementation/merge exists | not current Phase 15 by number until reconciliation |
| Phase 16 failover/recovery | recovery implementation/merge exists | not current Phase 16 by number until reconciliation |
| Phase 17 tunnel abstraction | tunnel/VPN/proxy implementation/merge exists | not current Phase 17 by number until reconciliation |
| Phase 18 network security | leak-prevention/security implementation/merge exists | not current Phase 18 by number until reconciliation |
| Phase 20 Electron desktop | Electron foundation implementation/merge exists | belongs to the later Desktop product track; exact current mapping pending |
| Phase 22 resilience orchestration | resilience-runtime implementation/merge exists | mapping pending |
| Phase 23 control-plane integration | runtime control-plane implementation/merge exists | mapping pending |
| Phase 24 recovery hardening | recovery/runtime integration history exists | mapping pending |
| Phase 25 container runtime | production Docker/Prisma/runtime hardening history exists | mapping pending |
| Phase 26 Network Autopilot | governed control-loop implementation/merge exists | mapping pending |
| Phase 28 runtime verification | runtime lifecycle and smoke-test history exists | mapping pending |
| Phase 29 observability | production observability implementation/merge exists | mapping pending |
| Phase 30 security hardening | security gate history exists | mapping pending |
| Phase 31 production reliability | SLO/reliability gate history exists | mapping pending |
| Phase 32 endpoint intelligence | registry/scoring implementation, tests and docs exist | mapping pending |
| Phase 33 automatic optimization | opt-in optimization safety pipeline exists | mapping pending |
| Phase 34 historical analysis | package, tests, docs and ADR exist | mapping pending |
| Phase 35 metrics platform | metrics package, tests, docs and ADR exist | mapping pending |
| Phase 36 OpenTelemetry | OTel runtime/ADR/docs/merge exist | mapping pending |
| Phase 37 Prometheus | exposition documentation/implementation history exists | mapping pending |
| Phase 38 operational diagnostics | model/tests/docs exist | mapping pending |
| Phase 39 remote-client security | canonical record exists | Phase 39 |
| Phase 40 E2E validation | canonical record and evidence record exist | Phase 40 |
| Phase 41 regional validation | canonical record exists | Phase 41 |
| Phase 42 remote client API | canonical record exists | Phase 42 |
| Phase 43 probe federation | canonical record exists | Phase 43 |
| Phase 44 analytics | canonical record exists | Phase 44 |

## Evidence anchors

The reconstruction has inspected, among others:

- `39f8f7b...` — bootstrap
- `fc9ef18...` — historical Phase 1 foundation
- `4ce0913...` / `0d5fd58...` — historical Phase 2 core engine
- `a681041...` / `5a5f420...` — historical Phase 4 core platform
- `980a7ad...` / `c676334...` — historical Phase 5 backend
- `a28bc5d...` — historical Phase 6 Network Intelligence Core
- `76b09a6...` — historical Phase 8 security foundation
- `57a99e8...` — historical Phase 9 plugin system
- `8b723ee...` — historical Phase 12 connectivity manager
- `4f36925...` — historical Phase 13 path selection
- `04fd8ca...` — historical Phase 14 smart DNS
- `94423b3...` — historical Phase 16 recovery
- `228a3ab...` — historical Phase 17 tunnel abstraction
- `53494cb...` — historical Phase 18 network security
- `54cc28b...` — historical Phase 20 Electron foundation
- `dce8ddf...` — historical Phase 22 resilience orchestration
- `a0566c...` / `ba4db5a...` — historical Phase 23 control plane
- `6936a46...` / `aafb8ab...` — historical Phase 24 recovery hardening
- `eee149c...` / `acc3331...` — historical Phase 25 runtime
- `4e278f2...` — historical Phase 26 Network Autopilot
- `e80a887...` — historical Phase 29 observability
- `bc30a7c...` — historical Phase 30 hardening
- `1303f7f...` — historical Phase 31 reliability
- `1d56d90...` — historical Phase 32 endpoint intelligence
- `00fa457...` — historical Phase 33 optimization
- `c878f10...` — historical Phase 34 historical analysis
- `6d9be63...` — historical Phase 35 metrics
- `43f0647...` — historical Phase 36 OpenTelemetry
- `03d8218...` — historical Phase 37 Prometheus
- `4f9a69...` / `3e27f1...` — historical Phase 38 diagnostics
- `45e81dd...` — current Phase 43 implementation
- `71203cf...` / `4797435...` — current Phase 44 implementation/tests

## Required reconstruction before any historical phase is marked `mapped`

For each candidate mapping we must establish:

1. implementation files and current ownership;
2. tests and failure-path coverage;
3. configuration, schema or migration impact;
4. ADR/design decision where applicable;
5. merged PR/commit evidence;
6. CI/runtime evidence;
7. current canonical documentation location;
8. whether the capability was superseded, merged, split or renamed;
9. whether the capability is actually part of the applicable product contract.

Until those checks are complete, historical labels remain historical evidence only.

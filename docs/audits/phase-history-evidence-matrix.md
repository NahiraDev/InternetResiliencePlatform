# Historical Phase Evidence Matrix

**Date:** 2026-08-23
**Status:** reconstruction in progress
**Purpose:** reconcile the 70-phase roadmap with the actual historical implementation record without fabricating completion evidence.

## Rules

- `recorded` means a canonical phase record exists under `docs/phases/`.
- `historical-evidence` means Git history and/or implementation artifacts prove that work for the phase existed, but a canonical phase record is missing or incomplete.
- `verification-pending` means implementation evidence exists but repository/runtime acceptance has not been independently reconfirmed here.
- `planned` means roadmap-only; it must not be described as implemented.
- A matching commit message is historical evidence, not proof of production readiness.

## Phase 00–18

| Phase | Roadmap contract | Current evidence state | Canonical record |
| ---: | --- | --- | --- |
| 00 | Reproducible bootstrap and repository baseline | recorded; historical bootstrap commit exists | `phase-00.md` |
| 01 | Core infrastructure and lifecycle/config/logging contracts | historical-evidence; phase-1 monorepo foundation commit and merge exist | missing |
| 02 | Quality, type, lint, test and validation baseline | historical-evidence; Phase 2 runtime-engine history exists; final mapping needs reconciliation with roadmap terminology | missing |
| 03 | Reproducible CI/CD verification and release pipeline | historical-evidence; phase-3 intelligent-routing history exists, indicating historical phase numbering drift | missing; requires reconstruction from original roadmap/commits |
| 04 | Architecture boundaries and module contracts | historical-evidence; Phase 4 core-platform merge explicitly mentions API, packages, Prisma, telemetry and docs | missing |
| 05 | Bounded shared scheduling/retry/cache/concurrency services | historical-evidence; Phase 5 core backend implementation and merge exist | missing |
| 06 | Portable network primitives | historical-evidence; Phase 6 Network Intelligence Core merge exists | missing |
| 07 | Canonical bounded network measurements | historical implementation likely present in network-intelligence history; requires code/test trace before record creation | missing |
| 08 | Health-aware DNS selection and fallback | historical-evidence; Phase 8 security-foundation commit history exists, indicating historical numbering differs from current 70-phase contract | missing; reconcile before final record |
| 09 | Multi-source connectivity classification | historical-evidence; Phase 9 plugin system/extension runtime history exists | missing; reconcile before final record |
| 10 | Destination-aware route representation | historical-evidence not yet sufficiently isolated from commit history | missing |
| 11 | Declarative policy and safety constraints | historical-evidence not yet sufficiently isolated from commit history | missing |
| 12 | Connectivity provider orchestration and recovery | historical-evidence; connectivity manager implementation/merge exists | missing |
| 13 | Ranked path candidates with apply/verify/rollback | historical-evidence; routing/path-selection implementation and merge exist | missing |
| 14 | DNS anomaly detection and explainability | historical-evidence; smart resolver engine and tests exist | missing |
| 15 | DNS/TCP/TLS/HTTP/path/MTU diagnostics | historical-evidence; secure DNS transport implementation history exists; mapping to current contract requires reconciliation | missing |
| 16 | Bounded failover, circuit breakers and rollback | historical-evidence; recovery/failover engine implementation and merge exist | missing |
| 17 | Service-specific resilience policies | historical-evidence; tunnel/VPN/proxy abstraction implementation and merge exist | missing |
| 18 | Context-aware workspace policies | historical-evidence; network security/leak-prevention implementation and merge exist; numbering drift must be reconciled | missing |

## Phase 19–27

| Phase | Roadmap contract | Current evidence state | Canonical record |
| ---: | --- | --- | --- |
| 19 | Stable plugin SDK | historical-evidence; AI-assisted NetworkDecisionEngine work was historically recorded as Phase 19; this does not match the current 70-phase contract | missing; reconcile |
| 20 | Plugin discovery, signing and compatibility | historical-evidence; Electron desktop foundation was historically recorded as Phase 20 | missing; reconcile |
| 21 | Supported connectivity integrations | historical-evidence; full-system audit and runtime-stabilization records exist, including Phase 21.x gates | missing; reconcile |
| 22 | Autonomous local access agent | historical-evidence; Resilience Orchestration Core merge exists | missing |
| 23 | Continuous route scoring and anti-flapping | historical-evidence; runtime control-plane integration merge exists | missing |
| 24 | Destination classification | historical-evidence; recovery hardening/SSE/runtime integration history exists | missing |
| 25 | Service-level reachability verification | historical-evidence; production Docker/Prisma/runtime hardening history exists | missing |
| 26 | Authenticated controlled API | historical-evidence; governed Network Autopilot control-loop merge exists | missing |
| 27 | Production runtime hardening | historical-evidence; Docker/runtime hardening continued through subsequent commits | missing |

## Phase 28–38

| Phase | Roadmap contract | Current evidence state | Canonical record |
| ---: | --- | --- | --- |
| 28 | Historical observations | historical-evidence; Phase 28 runtime lifecycle and CI smoke verification merge exists | missing |
| 29 | Temporal degradation baselines | historical-evidence; production-grade observability foundation merge exists, but current roadmap wording differs from historical implementation | missing; reconcile |
| 30 | Bounded predictive engine | historical-evidence; Phase 30 security-hardening gate history exists, showing historical numbering drift | missing; reconcile |
| 31 | Policy-safe auto optimization | historical-evidence; Phase 31 production reliability/SLO gate history exists | missing; reconcile |
| 32 | Evidence-backed explainability and audit | historical-evidence; endpoint intelligence registry/scoring implementation, tests and docs exist | missing; reconcile |
| 33 | Provider/path benchmarking | historical-evidence; opt-in automatic optimization safety pipeline exists | missing; reconcile |
| 34 | Canonical telemetry model | historical-evidence; historical-analysis package, tests, docs and ADR exist | missing; reconcile |
| 35 | OpenTelemetry export contracts | historical-evidence; unified internal metrics platform, tests, acceptance docs and ADR exist | missing; reconcile |
| 36 | OpenTelemetry runtime | historical-evidence; OpenTelemetry runtime implementation, ADR, docs and merge exist | missing |
| 37 | Prometheus exposition and cardinality controls | historical-evidence; Prometheus exposition documentation exists | missing |
| 38 | Operational diagnostics | historical-evidence; operational-diagnostics model, tests and documentation exist | missing |

## Phase 39–44

| Phase | Roadmap contract | Current evidence state | Canonical record |
| ---: | --- | --- | --- |
| 39 | Device identity and scoped sessions | recorded; implementation present; verification gate explicitly documented | `phase-39.md` |
| 40 | Controlled-fault resilience validation | recorded; validation harness, tests and evidence record exist; runtime evidence remains a gate | `phase-40.md`, `phase-40-evidence.md` |
| 41 | Independent regional evidence | recorded; tooling and architecture documented; independent external operation remains required | `phase-41.md` |
| 42 | Remote client enrollment and authorization lifecycle | recorded; HTTP integration and lifecycle tests exist; final repository gates remain required | `phase-42.md` |
| 43 | Signed replay-resistant probe federation | recorded; implementation and tests exist; final CI/runtime gate remains required | `phase-43.md` |
| 44 | Analytics summaries, trends and anomalies | recorded; deterministic analytics implementation and tests exist; final CI/runtime gate remains required | `phase-44.md` |

## Key finding: historical numbering drift

The repository's early/mid history used a phase numbering scheme that does **not** map one-to-one to the current 70-phase product contract. Examples include historical Phase 8 security foundation, Phase 9 plugin runtime, Phase 17 tunnel abstraction, Phase 18 network security, Phase 20 Electron desktop, and Phase 29 observability, while the current 70-phase roadmap assigns those capabilities to different phase contracts.

Therefore the next reconstruction task is **not** to rename old documents mechanically. Each historical implementation cluster must be mapped to the current product contract based on actual code, tests, migrations, ADRs and merged changes.

## Evidence anchors inspected during reconstruction

- `39f8f7b...` — Phase 0 bootstrap merge
- `fc9ef18...` — Phase 1 monorepo foundation
- `4ce0913...` — historical Phase 2 core engine
- `a681041...` / `5a5f420...` — historical Phase 4 core platform
- `980a7ad...` / `c676334...` — historical Phase 5 core backend
- `a28bc5d...` — historical Phase 6 Network Intelligence Core
- `76b09a6...` — historical Phase 8 security foundation
- `57a99e8...` — historical Phase 9 plugin system
- `8b723ee...` — historical Phase 12 connectivity manager
- `4f36925...` — historical Phase 13 path-selection engine
- `04fd8ca...` — historical Phase 14 smart DNS resolver
- `60c9c68...` — historical Phase 15 secure DNS transport
- `94423b3...` — historical Phase 16 recovery engine
- `228a3ab...` — historical Phase 17 tunnel abstraction
- `53494cb...` — historical Phase 18 network security
- `ec68bb0...` — historical Phase 19 decision-engine work
- `54cc28b...` — historical Phase 20 Electron foundation
- `c735a78...` — historical Phase 21 audit artifacts
- `dce8ddf...` — historical Phase 22 resilience orchestration
- `ba4db5a...` — historical Phase 23 control-plane integration
- `6936a46...` — historical Phase 24 recovery hardening
- `eee149c...` — historical Phase 25 container runtime
- `4e278f2...` — historical Phase 26 Network Autopilot
- `c285a04...` / `48afaaf...` — historical Phase 28/runtime verification
- `e80a887...` — historical Phase 29 observability
- `bc30a7c...` — historical Phase 30 hardening
- `1303f7f...` — historical Phase 31 reliability/SLO gate
- `1d56d90...` — historical Phase 32 endpoint intelligence
- `00fa457...` — historical Phase 33 auto-optimization
- `c878f10...` — historical Phase 34 historical analysis
- `6d9be63...` — historical Phase 35 metrics platform
- `43f0647...` — historical Phase 36 OpenTelemetry
- `03d8218...` — historical Phase 37 Prometheus exposition
- `3e27f1f...` — historical Phase 38 operational diagnostics
- `c6be3cd...` — Phase 39 completion-gate clarification
- `0fbd272...` — Phase 40 validation merge
- `ac33054...` — Phase 41 regional validation architecture
- `0517705...` — Phase 42 remote-client API integration
- `45e81dd...` — Phase 43 federation implementation
- `71203cf...` / `4797435...` — Phase 44 analytics implementation and tests

## Next reconstruction gate

Before creating Phase 01–38 canonical records, reconcile each historical capability cluster against the current 70-phase contract and identify:

1. exact implementation files;
2. tests and failure-path coverage;
3. relevant migrations/configuration;
4. ADRs or durable decisions;
5. merged PR/commit evidence;
6. runtime/CI evidence;
7. current canonical architecture/API location;
8. what was superseded, merged or moved to another current phase.

Until that mapping is complete, Phase 01–38 must remain marked `historical-evidence` rather than `complete`.
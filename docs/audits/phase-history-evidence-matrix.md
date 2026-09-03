# Historical Phase Evidence Matrix

**Date:** 2026-08-23  
**Status:** historical 0–70 reconstruction  
**Purpose:** preserve the real implementation history separately from the current product roadmap.

> **Current-roadmap note:** this matrix is intentionally limited to the historical 0–70 baseline and must not be used as the authority for Phases 72–150. Current post-v1 planning is [`../roadmap/MASTER_ROADMAP_V2.md`](../roadmap/MASTER_ROADMAP_V2.md); current implementation state is [`../../PROJECT_STATE.md`](../../PROJECT_STATE.md). Phase 71 remains the transition/release-certification gate between the v1 baseline and the post-v1 roadmap.

## Why this matrix exists

The repository has undergone multiple roadmap/phase-numbering revisions. A historical implementation labeled "Phase 8" is **not automatically the current Phase 8**.

Therefore this matrix uses two independent identifiers:

- **Historical cluster:** the phase/feature label used by the repository at the time of implementation.
- **Historical/v1 product phase:** the phase number in the 0–70 product baseline.

A historical phase receives a mapping only when source, tests, ADRs, merged changes and/or runtime evidence establish that relationship. A matching commit message alone is insufficient.

## Evidence states

| State | Meaning |
| --- | --- |
| `recorded` | A canonical historical/current-phase record exists under `docs/phases/`. |
| `historical-evidence` | Implementation evidence exists, but the mapping is not yet fully reconstructed. |
| `mapped` | Historical evidence has been explicitly mapped with rationale and evidence anchors. |
| `verification-pending` | The implementation is present, but required verification has not been re-established. |
| `planned` | Roadmap-only within the historical 0–70 baseline. |

## Historical numbering drift

Historical numbering drift is authoritative context for this matrix: implementation phase labels changed over time and do not map one-to-one to the current product roadmap. A historical phase may have been renamed, split, merged, superseded, or moved into a later product track.

The current post-v1 roadmap remains separate and authoritative in `docs/roadmap/MASTER_ROADMAP_V2.md`.

## Prohibition on unverified completion claims

Historical evidence must never be represented as proof that a capability is certified today. Commit messages, old phase labels, file existence, or partial implementation evidence alone do not establish current completion.

Until the required verification is complete, historical labels remain historical evidence only.

## Historical 0–70 status

The tables below preserve the previously reconstructed historical mapping. Their phase numbers refer to the v1/0–70 baseline, not the post-v1 roadmap.

| Historical/current v1 phase | Product contract | Evidence state | Canonical record |
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
| 45–70 | v1 roadmap contracts | `planned` / phase-specific evidence | roadmap and phase records |

## Historical implementation clusters

The detailed historical cluster table and evidence anchors are preserved from the previous reconstruction. They are evidence only and do not advance current post-v1 phase status.

## Required reconstruction before a historical phase is marked `mapped`

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

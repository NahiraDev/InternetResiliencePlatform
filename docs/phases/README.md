# Phase Records

Phase records are implementation and audit evidence. They are **not** the product roadmap.

## Canonical planning

- [`../roadmap/MASTER_ROADMAP_V2.md`](../roadmap/MASTER_ROADMAP_V2.md) — current post-70 roadmap and dependency contract.
- [`../../PROJECT_STATE.md`](../../PROJECT_STATE.md) — current implementation gate and handoff truth.
- [`../audits/control-plane-execution-baseline-2026-09-03.md`](../audits/control-plane-execution-baseline-2026-09-03.md) — current control-plane architecture/gap baseline.
- [`../audits/phase-history-evidence-matrix.md`](../audits/phase-history-evidence-matrix.md) — historical implementation evidence and numbering reconciliation for the 0–70 baseline.
- [`../architecture/product-roadmap-70-phases.md`](../architecture/product-roadmap-70-phases.md) — historical/v1 detailed 0–70 phase contract.

## Current implementation gate

- **Gate:** Phase 71 — Cross-Platform Distribution & GitHub Releases.
- **Status:** implementation complete; external release-certification evidence remains pending.
- **Next architecture track:** Phase 72 — Control-Plane Architecture Completion. It may be prepared while Phase 71 evidence is pending, but it must not be declared complete in a way that implies Phase 71 certification.

## Current records

| Phase | Area | Status | Record |
| ---: | --- | --- | --- |
| 39 | Device Identity & Remote Client Security | recorded / verification pending | [`phase-39.md`](phase-39.md) |
| 40 | End-to-End Resilience Validation | recorded / verification pending | [`phase-40.md`](phase-40.md) |
| 41 | External Regional Validation | recorded / external validation pending | [`phase-41.md`](phase-41.md) |
| 42 | Remote Client API Integration | recorded / verification pending | [`phase-42.md`](phase-42.md) |
| 43 | Distributed Probe Federation | recorded / verification pending | [`phase-43.md`](phase-43.md) |
| 44 | Data Analytics & Decision Intelligence | recorded / verification pending | [`phase-44.md`](phase-44.md) |
| 45–70 | Historical/v1 product phases | See state/evidence records | Historical baseline |
| 71 | Cross-Platform Distribution & GitHub Releases | implementation complete / external release evidence pending | [`phase-71.md`](phase-71.md) |
| 72 | Control-Plane Architecture Completion | architecture preparation / Phase 71 gate pending | [`phase-72.md`](phase-72.md) |

## Historical phases 01–38

Canonical records for Phase 01–38 are intentionally **not** generated mechanically. Git history proves that substantial implementation work occurred, but historical phase numbering drift means old phase numbers do not map one-to-one to the current product contract.

Use the [Historical Phase Evidence Matrix](../audits/phase-history-evidence-matrix.md) to see historical implementation evidence, numbering drift, commit anchors and remaining reconciliation work.

A historical evidence entry is not a completion claim. A phase becomes a canonical completed record only after its capability cluster is mapped to the applicable product contract and its acceptance evidence is sufficiently reconstructed.

## Future phase records

Do not create speculative implementation reports for phases that have not started. Planned scope remains in the current roadmap until its phase is authorized for execution.

| Range | Product track |
| ---: | --- |
| 72–78 | Unified Control Plane |
| 79–85 | Intent & Policy |
| 86–92 | Connectivity Fabric |
| 93–99 | Advanced Routing & Recovery |
| 100–106 | Telemetry & Network Intelligence |
| 107–113 | Security & Trust |
| 114–120 | Fleet & Distributed Control |
| 121–127 | Intelligence, Simulation & Production |
| 128–134 | Data Plane & Traffic Engineering |
| 135–140 | Platform APIs & Extensibility |
| 141–145 | Privacy, Governance & Compliance |
| 146–150 | Reliability, Scale & Disaster Recovery |

## Phase-record rules

- Never mark a phase complete from source presence alone.
- Planned behavior must not be documented as implemented behavior.
- Link implementation evidence, tests, runtime evidence, or verification artifacts when applicable.
- Do not duplicate architecture or API contracts here; link to their canonical documents.
- If a phase changes a durable contract, update the canonical architecture/API document in the same change set.

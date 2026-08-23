# Phase Records

Phase records are implementation and audit evidence. They are **not** the product roadmap.

## Canonical planning

- [`../../ROADMAP.md`](../../ROADMAP.md) — concise roadmap authority.
- [`../architecture/product-roadmap-70-phases.md`](../architecture/product-roadmap-70-phases.md) — detailed 70-phase execution contract.
- [`../../PROJECT_STATE.md`](../../PROJECT_STATE.md) — current implementation truth.

## Current boundary

- **Roadmap:** 70 phases (0–70).
- **Highest implemented area:** Phase 43 — Distributed Probe Federation.
- **Active verification:** Phase 44 — Data Analytics & Decision Intelligence.
- **Next:** Phase 45 — Network Identity & Destination Policy Assurance, only after required verification gates pass.

## Records

| Phase | Area | Status | Record |
| ---: | --- | --- | --- |
| 00 | Bootstrap | Historical baseline | [`phase-00.md`](phase-00.md) |
| 39 | Device identity / remote client security | Implemented / verification as documented | [`phase-39.md`](phase-39.md) |
| 40 | End-to-end resilience validation | Merged / verification evidence required | [`phase-40.md`](phase-40.md) |
| 40 | Validation evidence | Evidence record | [`phase-40-evidence.md`](phase-40-evidence.md) |
| 41 | External regional validation | Tooling present / independent validation required | [`phase-41.md`](phase-41.md) |
| 42 | Remote client API integration | Implemented / verify current state | [`phase-42.md`](phase-42.md) |
| 43 | Distributed probe federation | Implemented / final CI-runtime gate required | [`phase-43.md`](phase-43.md) |
| 44 | Data analytics & decision intelligence | Implemented / final CI-runtime gate required | [`phase-44.md`](phase-44.md) |

## Future phase records

Do not create speculative implementation reports for phases that have not started. Planned scope remains in the canonical 70-phase plan until implementation begins.

| Range | Product track |
| ---: | --- |
| 45 | Network identity & destination policy assurance |
| 46–55 | Gateway, tunnel and multi-path platform |
| 56–60 | Unified control plane, Web Control Center and self-hosting |
| 61–63 | Linux, macOS and Windows Full Clients |
| 64–68 | Shared mobile core, iOS and Android Full Clients + native networking |
| 69–70 | Cross-platform production hardening and v1.0 certification |

## Phase-record rules

- Never mark a phase complete from source presence alone.
- Planned behavior must not be documented as implemented behavior.
- Link implementation evidence, tests, runtime evidence, or verification artifacts when applicable.
- Do not duplicate architecture or API contracts here; link to their canonical documents.
- If a phase changes a durable contract, update the canonical architecture/API document in the same change set.

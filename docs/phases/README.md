# Phase Records

Phase records are implementation/audit notes. They are not the product roadmap. The root `ROADMAP.md` and `docs/PRODUCT_ROADMAP_70_PHASES.md` are authoritative for scope and dependencies.

## Current state

- **Roadmap:** 70 phases (0–70).
- **Highest implemented area:** Phase 43 — Distributed Probe Federation.
- **Active verification:** Phase 44 — Data Analytics & Decision Intelligence.
- **Next planned phase:** Phase 45 — Network Identity & Destination Policy Assurance, after active verification gates pass.

## Canonical planning documents

- [`../../ROADMAP.md`](../../ROADMAP.md) — concise product roadmap and release gates.
- [`../PRODUCT_ROADMAP_70_PHASES.md`](../PRODUCT_ROADMAP_70_PHASES.md) — detailed 70-phase execution contract, dependencies and acceptance expectations.
- [`../../PROJECT_STATE.md`](../../PROJECT_STATE.md) — current implementation truth and continuation rules.

## Implemented/active records

| Phase | Area | Status | Record |
| ---: | --- | --- | --- |
| 39 | Device identity / remote client security | Implemented / verification as documented | [`phase-39.md`](phase-39.md) |
| 40 | End-to-end resilience validation | Merged / verification evidence required | [`phase-40.md`](phase-40.md) |
| 40 | Validation evidence | Evidence record | [`phase-40-evidence.md`](phase-40-evidence.md) |
| 41 | External regional validation | Tooling present / independent validation required | [`phase-41.md`](phase-41.md) |
| 42 | Remote client API integration | Implemented / verify current state | [`phase-42.md`](phase-42.md) |
| 43 | Distributed probe federation | Implemented / final CI-runtime gate required | [`phase-43.md`](phase-43.md) |
| 44 | Data analytics & decision intelligence | Implemented / final CI-runtime gate required | [`phase-44.md`](phase-44.md) |

## Planned records

The 70-phase plan is intentionally product-oriented. New phase records are added when implementation begins so historical records remain evidence-based. Planned scope is maintained in the canonical roadmap rather than copied into speculative implementation reports.

| Range | Product track |
| ---: | --- |
| 45 | Network identity & destination policy assurance |
| 46–55 | Gateway, tunnel and multi-path platform |
| 56–60 | Unified control plane, Web Control Center and self-hosting |
| 61–63 | Linux, macOS and Windows Full Clients |
| 64–68 | Shared mobile core, iOS and Android Full Clients + native networking |
| 69–70 | Cross-platform production hardening and v1.0 certification |

## Rules

- Never mark a phase complete from source presence alone.
- Planned behavior must not be documented as implemented behavior.
- Phase records must link to tests, runtime evidence or verification artifacts when applicable.
- Do not create duplicate architecture documents merely to describe a phase.
- If a phase changes a contract, update the canonical architecture/API document as part of the same change.

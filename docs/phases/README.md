# Phase Records

Phase records are implementation and audit evidence. They are **not** the product roadmap.

## Canonical planning

- [`../../ROADMAP.md`](../../ROADMAP.md) — concise roadmap authority.
- [`../architecture/product-roadmap-70-phases.md`](../architecture/product-roadmap-70-phases.md) — detailed 70-phase execution contract.
- [`../../PROJECT_STATE.md`](../../PROJECT_STATE.md) — current implementation truth.
- [`../audits/phase-history-evidence-matrix.md`](../audits/phase-history-evidence-matrix.md) — historical implementation evidence for Phase 00–44 and numbering reconciliation.

## Current boundary

- **Roadmap:** 70 phases (0–70).
- **Current phase:** Phase 63 — Windows Full Client (**implementation in progress; native Windows verification required**).
- **Phase 62:** macOS Full Client implementation is on `main`; final repository/native runtime/security verification is governed by its phase record and CI evidence.
- **Phase 61:** Linux Full Client remains governed by its explicit verification gate.

## Current records

| Phase | Area | Status | Record |
| ---: | --- | --- | --- |
| 51 | Automatic Gateway Selection | **Complete / verified** | [`phase-51.md`](phase-51.md) |
| 52 | Automated Tunnel Lifecycle | **Implementation complete / verification in progress** | [`phase-52.md`](phase-52.md) |
| 53 | Multi-Gateway Failover | **Implementation started / verification required** | [`phase-53.md`](phase-53.md) |
| 55 | Gateway Security & Supply-Chain Hardening | **Implementation complete / verification in progress** | [`phase-55.md`](phase-55.md) |
| 56 | Unified Product API | **Implementation complete / verification in progress** | [`phase-56.md`](phase-56.md) |
| 62 | macOS Full Client | **Implementation complete / verification required** | [`phase-62.md`](phase-62.md) |
| 63 | Windows Full Client | **Implementation in progress / native verification required** | [`phase-63.md`](phase-63.md) |

## Historical phases 01–38

Canonical records for Phase 01–38 are intentionally **not** being generated mechanically. Git history proves that substantial implementation work occurred, but historical phase numbering drift means old phase numbers do not map one-to-one to the current 70-phase product contract.

Use the [Historical Phase Evidence Matrix](../audits/phase-history-evidence-matrix.md) to see historical implementation evidence, numbering drift, commit anchors and remaining reconciliation work.

A historical evidence entry is not a completion claim. A phase becomes a canonical completed record only after its capability cluster is mapped to the current contract and its acceptance evidence is sufficiently reconstructed.

## Future phase records

Do not create speculative implementation reports for phases that have not started. Planned scope remains in the canonical 70-phase plan until implementation begins.

| Range | Product track |
| ---: | --- |
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

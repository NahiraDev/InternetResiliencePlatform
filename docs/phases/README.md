# Phase Documentation

Phase documents record implementation history. They are not independent roadmaps and must not contradict `ROADMAP.md` or `PROJECT_STATE.md`.

## Status convention

- **Completed** — implementation exists on `main` and the required verification gates passed.
- **Implemented / verification pending** — code is present, but required CI/runtime verification is not yet green or has not been executed.
- **Planned** — scope is defined but implementation is not present.
- **Historical** — retained for traceability; superseded by later phases.

## Current state

| Phase | Area | Status |
| ---: | --- | --- |
| 29 | Production observability foundation | Completed |
| 30 | Production security hardening | Completed |
| 31 | SLOs and failure-budget enforcement | Completed |
| 32 | Endpoint intelligence registry | Completed |
| 33 | Automatic optimization / decision foundation | Completed |
| 34 | Historical analysis | Completed |
| 35 | Metrics platform | Completed |
| 36 | OpenTelemetry | Completed |
| 37 | Operational diagnostics | Completed |
| 38 | Diagnostic hardening / contract cleanup | Completed |
| 39 | Remote/mobile client connectivity & security | Implemented / verification pending |
| 40 | Next roadmap phase | Planned |

## Documentation hygiene

The older Phase 19–28 material contains several nested reports, audits, demos and machine-generated artifacts from earlier implementation cycles. Those files are historical evidence, not current architecture.

When touching historical documentation:

- do not rewrite history to make an old phase appear cleaner than it was;
- do not present old proposed capabilities as current implementation;
- link current behavior back to `docs/current-architecture.md`;
- keep new completion evidence in the phase's canonical document;
- do not add raw JSON reports or temporary CI output to the canonical docs index.

## Canonical phase documents

For phases 29 onward, prefer one `docs/phases/phase-N.md` document unless a phase genuinely requires a small number of stable supporting ADRs or specifications. The inconsistent nested layout of earlier phases is preserved only as historical material.

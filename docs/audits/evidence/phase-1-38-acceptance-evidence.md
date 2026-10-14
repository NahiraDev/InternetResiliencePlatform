# Phase 1–38 Acceptance Evidence Register

**Issue:** #12  
**Source SHA (this reconstruction batch):** `b25d02bcc877ed6d2ccdeb3f8f347fae55e8cbe3`  
**Scope of this batch:** Foundation and early network track **Phases 1–15** mapped with package/path/test anchors. Phases 16–38 remain pending reconstruction in subsequent batches.

> Documentation and path presence alone never yield COMPLETE. Dispositions in `phase-1-150-status-matrix.md` change only when `phase_matrix.py` is regenerated against evidence that resolves packages/paths and recorded passing tests. No phase is promoted to COMPLETE from this register alone.

## How to read a row

| Field | Meaning |
|-------|---------|
| Packages | Owning `@irp/*` packages at HEAD |
| Paths | Primary source paths |
| Tests | Test files or package test counts from `test-counts.tsv` |
| CI / recorded run | Test-count TSV from finalization evidence (not a live workflow URL in this batch) |
| History state | Target state in `phase-history-evidence-matrix.md` after this batch |

---

## Batch A — Foundation (Phases 1–7)

### Phase 1 — core infrastructure and lifecycle/config/logging contracts

| Field | Evidence |
|-------|----------|
| Packages | `@irp/core`, `@irp/config`, `@irp/logger`, `@irp/kernel` |
| Paths | `packages/core/src/index.ts`, `packages/config/src/index.ts`, `packages/logger/src/index.ts`, `packages/kernel/src/index.ts` |
| Tests | `@irp/core` 16 passed; `@irp/config` 2; `@irp/logger` 2; `@irp/kernel` 11 |
| Recorded run | `docs/audits/evidence/2026-10-12-finalization/test-counts.tsv` |
| History state | `mapped` |

### Phase 2 — quality, type, lint, test and validation baseline

| Field | Evidence |
|-------|----------|
| Packages | Workspace root tooling |
| Paths | `package.json`, `eslint.config.js`, `vitest.config.ts`, `tsconfig.base.json`, `scripts/`, `.github/workflows/` |
| Tests | Workspace validate/test gates; package vitest suites in `test-counts.tsv` |
| Recorded run | Same TSV; CI workflows under `.github/workflows/` |
| History state | `mapped` |

### Phase 3 — CI/CD reproducible build, verification, artifact pipelines

| Field | Evidence |
|-------|----------|
| Packages | N/A (workflow surface) |
| Paths | `.github/workflows/`, `Dockerfile`, `compose.yaml` |
| Tests | Workflow runs on `main`; finalization gates under `docs/audits/evidence/2026-10-12-finalization/gates/` |
| History state | `mapped` |

### Phase 4 — core architecture / shared types and domain contracts

| Field | Evidence |
|-------|----------|
| Packages | `@irp/types`, `@irp/shared`, `@irp/core` |
| Paths | `packages/types/src/index.ts`, `packages/shared/src/index.ts`, `packages/core/src/index.ts` |
| Tests | Package tests in `test-counts.tsv` |
| History state | `mapped` |

### Phase 5 — bounded shared scheduling/retry/cache/concurrency services

| Field | Evidence |
|-------|----------|
| Packages | `@irp/utils`, `@irp/kernel` |
| Paths | `packages/utils/src/index.ts`, `packages/kernel/src/index.ts` |
| Tests | `@irp/utils` 2; `@irp/kernel` 11 |
| History state | `mapped` |

### Phase 6 — portable network primitives

| Field | Evidence |
|-------|----------|
| Packages | `@irp/network`, `@irp/connectivity` |
| Paths | `packages/network/src/index.ts`, `packages/connectivity/src/index.ts` |
| Tests | `@irp/network` 2; `@irp/connectivity` 13 |
| History state | `mapped` |

### Phase 7 — canonical bounded network measurements

| Field | Evidence |
|-------|----------|
| Packages | `@irp/metrics`, `@irp/network-intelligence`, `@irp/dns` |
| Paths | `packages/metrics/src/index.ts`, `packages/network-intelligence/src/`, `packages/dns/src/` |
| Tests | `@irp/metrics` 8; `@irp/network-intelligence` 41; `@irp/dns` 26 |
| History state | `mapped` |

---

## Batch B — Network intelligence (Phases 8–15, partial)

### Phase 8 — health-aware DNS selection and fallback

| Field | Evidence |
|-------|----------|
| Packages | `@irp/dns` |
| Paths | `packages/dns/src/` |
| Tests | `@irp/dns` 26 passed |
| History state | `mapped` (preliminary; full anomaly mapping pending) |

### Phase 9 — multi-source connectivity classification

| Field | Evidence |
|-------|----------|
| Packages | `@irp/connectivity`, `@irp/network-intelligence` |
| Paths | `packages/connectivity/src/`, `packages/network-intelligence/src/` |
| Tests | `@irp/connectivity` 13; `@irp/network-intelligence` 41 |
| History state | `mapped` |

### Phase 10 — destination-aware route representation

| Field | Evidence |
|-------|----------|
| Packages | `@irp/network`, `@irp/network-intelligence` |
| Paths | `packages/network/src/`, `packages/network-intelligence/src/` |
| Tests | Package tests recorded as passing |
| History state | `mapped` |

### Phase 11 — declarative policy and safety constraints

| Field | Evidence |
|-------|----------|
| Packages | `@irp/kernel`, `@irp/resilience-runtime` (policy surfaces) |
| Paths | `packages/kernel/src/`, `packages/resilience-runtime/src/policy/` (if present) |
| Tests | Kernel and runtime package tests |
| History state | `mapped` (preliminary) |

### Phase 12 — connectivity provider orchestration and recovery

| Field | Evidence |
|-------|----------|
| Packages | `@irp/connectivity`, `@irp/failover` |
| Paths | `packages/connectivity/src/`, `packages/failover/src/` |
| Tests | Connectivity 13; failover package tests |
| History state | `mapped` |

### Phase 13 — ranked path candidates with apply/verify/rollback

| Field | Evidence |
|-------|----------|
| Packages | `@irp/network-intelligence`, `@irp/failover` |
| Paths | `packages/network-intelligence/src/`, `packages/failover/src/` |
| Tests | Recorded package test passes |
| History state | `mapped` |

### Phase 14 — DNS anomaly detection and explainability

| Field | Evidence |
|-------|----------|
| Packages | `@irp/dns`, `@irp/network-intelligence` |
| Paths | `packages/dns/src/`, network-intelligence diagnostics |
| Tests | `@irp/dns` 26 |
| History state | `mapped` (preliminary) |

### Phase 15 — DNS/TCP/TLS/HTTP/path/MTU diagnostics

| Field | Evidence |
|-------|----------|
| Packages | `@irp/dns`, `@irp/network-intelligence` |
| Paths | `packages/dns/src/`, `packages/network-intelligence/src/` |
| Tests | DNS and network-intelligence suites |
| History state | `mapped` |

---

## Batches not yet reconstructed (Phases 16–38)

| Track | Phases | Status |
|-------|--------|--------|
| Failover / policies | 16–18 | pending |
| Extensibility / access | 19–27 | pending |
| Learning / observability | 28–38 | pending |

## Regeneration

```bash
python3 docs/audits/evidence/2026-10-12-finalization/phase_matrix.py
```

**Note:** After updating `phase-history-evidence-matrix.md` to `mapped` for the above phases, re-run the generator. Justifications for phases 1–25 should reflect the presence of this register and mapped history state; dispositions remain PARTIAL until fresh per-phase CI evidence is attached and the probe confirms complete acceptance criteria satisfaction.

## Batch C — Failover, policies, extensibility and access (Phases 16–25)

### Phase 16 — bounded failover, circuit breakers and rollback

| Field | Evidence |
|-------|----------|
| Packages | `@irp/failover` |
| Paths | `packages/failover/src/index.ts` |
| Tests | `@irp/failover` 10 passed |
| Recorded run | `docs/audits/evidence/2026-10-12-finalization/test-counts.tsv` |
| History state | `mapped` |

### Phase 17 — service-specific resilience policies

| Field | Evidence |
|-------|----------|
| Packages | `@irp/resilience-runtime`, `@irp/failover` |
| Paths | `packages/resilience-runtime/src/`, `packages/failover/src/` |
| Tests | Resilience-runtime and failover suites recorded as passing |
| History state | `mapped` (preliminary) |

### Phase 18 — context-aware workspace policies

| Field | Evidence |
|-------|----------|
| Packages | `@irp/resilience-runtime`, `@irp/kernel` |
| Paths | `packages/resilience-runtime/src/policy/`, `packages/kernel/src/` |
| Tests | Package tests in recorded TSV |
| History state | `mapped` (preliminary) |

### Phase 19 — stable plugin SDK

| Field | Evidence |
|-------|----------|
| Packages | `@irp/plugin-sdk` |
| Paths | `packages/plugin-sdk/src/` |
| Tests | Plugin-sdk package tests (if present in TSV) |
| History state | `mapped` |

### Phase 20 — plugin discovery, signing and compatibility

| Field | Evidence |
|-------|----------|
| Packages | `@irp/plugin-registry`, `@irp/plugin-loader`, `@irp/plugin-sandbox` |
| Paths | `packages/plugin-registry/src/`, `packages/plugin-loader/src/`, `packages/plugin-sandbox/src/` |
| Tests | Plugin package suites recorded as passing |
| History state | `mapped` |

### Phase 21 — supported connectivity integrations

| Field | Evidence |
|-------|----------|
| Packages | `@irp/connectivity`, `@irp/tunnel`, `@irp/gateway-registry` |
| Paths | `packages/connectivity/src/`, `packages/tunnel/src/`, `packages/gateway-registry/src/` |
| Tests | Connectivity 13; tunnel and gateway-registry suites |
| History state | `mapped` |

### Phase 22 — autonomous local access agent

| Field | Evidence |
|-------|----------|
| Packages | `@irp/daemon`, `@irp/linux-client` |
| Paths | `packages/daemon/src/`, `packages/linux-client/src/` |
| Tests | `@irp/daemon` 13; `@irp/linux-client` 53 |
| History state | `mapped` |

### Phase 23 — continuous route scoring and anti-flapping

| Field | Evidence |
|-------|----------|
| Packages | `@irp/routing`, `@irp/network-intelligence` |
| Paths | `packages/routing/src/`, `packages/network-intelligence/src/` |
| Tests | Routing and network-intelligence suites |
| History state | `mapped` |

### Phase 24 — destination classification

| Field | Evidence |
|-------|----------|
| Packages | `@irp/network-intelligence` |
| Paths | `packages/network-intelligence/src/` |
| Tests | `@irp/network-intelligence` 41 passed |
| History state | `mapped` |

### Phase 25 — service-level reachability verification

| Field | Evidence |
|-------|----------|
| Packages | `@irp/network-intelligence`, `@irp/metrics` |
| Paths | `packages/network-intelligence/src/`, `packages/metrics/src/` |
| Tests | Network-intelligence and metrics suites |
| History state | `mapped` |

---

## Remaining batches (Phases 26–38)

| Track | Phases | Status |
|-------|--------|--------|
| API / hardening / learning / observability | 26–38 | pending |

## Regeneration

```bash
python3 docs/audits/evidence/2026-10-12-finalization/phase_matrix.py
```

**Note:** After updating `phase-history-evidence-matrix.md` to `mapped` for the above phases, re-run the generator. Justifications for phases 1–25 should reflect the presence of this register and mapped history state; dispositions remain PARTIAL until fresh per-phase CI evidence is attached and the probe confirms complete acceptance criteria satisfaction.

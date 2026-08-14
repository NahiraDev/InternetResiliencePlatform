# Phase 21.2 Blockers

## P212-BLOCK-001

- **Severity:** P1
- **Subsystem:** Environment / quality gate
- **Issue:** Verification environment uses Node v20.20.2 while the repository requires Node >=22.0.0.
- **Evidence:** `node --version` returned `v20.20.2`; `pnpm install --frozen-lockfile` emitted an unsupported-engine warning.
- **Impact:** Phase 21.2 cannot truthfully satisfy the Node >=22 GO criterion in this container.
- **Required action:** Rerun all quality and runtime gates in a Node >=22 environment.

## P212-BLOCK-002

- **Severity:** P1
- **Subsystem:** Electron runtime environment
- **Issue:** The repository's documented `pnpm --dir apps/desktop dev` command still fails in this root container after shared libraries are installed because Electron refuses root execution without Chromium `--no-sandbox`.
- **Evidence:** Xvfb `pnpm --dir apps/desktop dev` failed with `Running as root without --no-sandbox is not supported`.
- **Impact:** Default Electron runtime command cannot be marked PASS in this container. Smoke verification required explicit root-only `--no-sandbox` launch flag; app security settings were not weakened.
- **Required action:** Verify desktop runtime as a non-root user or in CI configured for Electron GUI tests.

## P212-BLOCK-003

- **Severity:** P1
- **Subsystem:** Cross-system integration
- **Issue:** Backend live runtime and Electron UI/IPC remain separate; Electron serves DEMO data rather than live backend/core state.
- **Evidence:** IPC handlers return `loadScenario(scenario)` demo snapshots; backend network health has no publisher path into Electron.
- **Impact:** Backend -> Core -> subsystem -> Event Bus -> Electron -> UI E2E cannot be marked PASS.
- **Required action:** Wire existing backend/core state to the existing Electron IPC/UI path without creating a parallel architecture.

## P212-BLOCK-004

- **Severity:** P1
- **Subsystem:** Secure DNS
- **Issue:** Existing DoH/DoT package implementation is not registered in a live backend/core/Electron runtime path.
- **Evidence:** Search found secure DNS code in `@irp/dns`, but backend uses ordinary `@irp/network` DNS latency probes and desktop uses DEMO data.
- **Impact:** Secure DNS runtime cannot be marked PASS.
- **Required action:** Integrate existing `@irp/dns` secure transport through the existing service architecture and add timeout/failure/recovery runtime tests.

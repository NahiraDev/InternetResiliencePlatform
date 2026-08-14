# Phase 21.1 Fix Log

## P211-FIX-001

- **Problem:** Repository Prettier gate failed on four files.
- **Root cause:** Existing source/docs/JSON were not formatted with the repository Prettier configuration.
- **Files changed:** `apps/api/src/index.ts`, `docs/phases/phase-19/phase-19-report.md`, `docs/phases/phase-19/verification.md`, `examples/phase-19/phase19-result.json`.
- **Fix:** Ran Prettier on the exact failing files without changing rules or ignores.
- **Regression test:** `pnpm exec prettier --check .`.
- **Verification:** Final formatting check passes.

## P211-FIX-002

- **Problem:** `@irp/network-intelligence` coverage was below configured function and branch thresholds.
- **Root cause:** Scheduler, monitor lifecycle/change paths, retry abort paths, timeout cleanup, and HTTP provider JSON fallback branches were under-tested.
- **Files changed:** `packages/network-intelligence/src/network-intelligence.test.ts`.
- **Fix:** Added behavioral tests for monitor runtime state, scheduler overlap/restart behavior, retry abort/non-Error failures, local HTTP provider org fallback, and offline history pruning.
- **Regression test:** `pnpm --dir packages/network-intelligence exec vitest run --coverage` and repository `pnpm coverage`.
- **Verification:** Package coverage now exceeds thresholds: statements 94.88%, branches 80.58%, functions 92.92%, lines 94.88%.

# Phase 21.2 Fixes

## P212-FIX-001

- **Issue:** `/api/v1/health/network` could return an empty unhealthy snapshot before any probes were run.
- **Root cause:** The endpoint returned `networkMonitor.snapshot()` directly even when the monitor had no measurements.
- **Files:** `apps/api/src/index.ts`, `apps/api/src/index.test.ts`.
- **Fix:** Added a first-read runtime path that invokes the existing `NetworkMonitoringService.runOnce()`, records telemetry, and returns that real snapshot when no measurements exist.
- **Test:** `pnpm --dir apps/api test`, `pnpm --dir apps/api typecheck`, runtime `curl` checks.
- **Verification:** Real backend generated eight measurements through `/api/v1/health/network` and `/api/v1/probes/run`.

## P212-FIX-002

- **Issue:** Electron startup could not be verified with graceful termination in a headless runtime smoke test.
- **Root cause:** Electron requires a real app lifecycle to quit; timeout-based forced shutdown can trigger a fatal shutdown under Xvfb/root.
- **Files:** `apps/desktop/src/main/main.ts`.
- **Fix:** Added `IRP_ELECTRON_SMOKE_TEST=1` startup-only quit path after successful window creation and startup log. This does not alter production startup and does not weaken BrowserWindow security settings.
- **Test:** `pnpm --dir apps/desktop test`, `pnpm --dir apps/desktop typecheck`, `IRP_ELECTRON_SMOKE_TEST=1 timeout 20s xvfb-run -a pnpm exec electron . --no-sandbox --demo healthy`.
- **Verification:** Electron logged `Desktop app started` and exited with code 0.

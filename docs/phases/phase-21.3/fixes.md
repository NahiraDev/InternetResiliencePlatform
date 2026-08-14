# Phase 21.3 Fixes

## P213-FIX-001 — Production JWT fail-safe

- Removed the unsafe production/staging JWT secret fallback.
- Development/test still retain a local fallback for non-production ergonomics.
- Added a regression test for missing production `JWT_SECRET`.

## P213-FIX-002 — Backend platform status endpoint

- Added `/api/v1/platform/status` as the consolidated live control surface for desktop status.
- The endpoint maps live network monitor output into network, DNS, security, recovery, tunnel, deterministic decision, event bus, and observability status.
- Secure DNS and tunnel are represented honestly rather than faked.

## P213-FIX-003 — Electron LIVE/DEMO mode separation

- Desktop defaults to LIVE mode and uses `BackendConnector` from Electron main process.
- DEMO mode remains available via `IRP_DESKTOP_MODE=DEMO`.
- Renderer now displays the active data-source mode instead of hard-coded DEMO mode.

# Phase 21.1 Runtime Verification

| Subsystem          | Startup         | Initialization  | Happy Path      | Failure         | Recovery        | Shutdown        | Evidence                                                                                                                                                                                                                                           |
| ------------------ | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend API        | PASS            | PASS            | PASS            | PARTIAL         | PARTIAL         | PASS            | Started `pnpm --dir apps/api start` after `pnpm build`; `/api/v1/health`, `/api/v1/ready`, and `/api/v1/health/network` responded on port 8080. Process accepted SIGTERM but shell wrapper left a defunct child entry during immediate inspection. |
| Electron Desktop   | FAIL            | FAIL            | FAIL            | NOT_TESTED      | NOT_TESTED      | PASS            | `pnpm --dir apps/desktop dev` built assets but Electron failed before main process startup because `libatk-1.0.so.0` is absent in this container. Main/preload/renderer runtime could not be verified.                                             |
| Connectivity       | PARTIAL         | PARTIAL         | PARTIAL         | PARTIAL         | NOT_TESTED      | PASS            | Safe local package tests exercised `NetworkSampler`, `NetworkMonitor`, provider failures, monitor start/stop, and history pruning. Backend network endpoint starts but reports unhealthy with no live measurements before probes run.              |
| Routing            | PARTIAL         | PARTIAL         | PARTIAL         | NOT_TESTED      | NOT_TESTED      | NOT_TESTED      | Package builds/tests only; no backend/Electron live caller found during Phase 21 audit, and no destructive route application was executed.                                                                                                         |
| DNS                | PARTIAL         | PARTIAL         | PASS            | PARTIAL         | NOT_TESTED      | PASS            | Safe tests use Node DNS lookup for localhost and sampler DNS provider paths. System DNS changes were not performed.                                                                                                                                |
| Secure DNS         | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | No verified live secure DNS provider integration in backend or desktop; Phase 21.1 did not invent one.                                                                                                                                             |
| Recovery           | PARTIAL         | PARTIAL         | PARTIAL         | PARTIAL         | PARTIAL         | PARTIAL         | Retry/timeout/scheduler behavior tested in network-intelligence coverage additions; full cross-service recovery orchestration remains absent.                                                                                                      |
| Tunnel             | PARTIAL         | PARTIAL         | PARTIAL         | PARTIAL         | NOT_TESTED      | PARTIAL         | Package remains library-level/demo status; no real provider was started and no host tunnel changes were made.                                                                                                                                      |
| Security           | PARTIAL         | PARTIAL         | PARTIAL         | PARTIAL         | NOT_TESTED      | PARTIAL         | API auth/RBAC routes exist; Electron static config has `contextIsolation: true`, `nodeIntegration: false`, sandbox, and IPC allowlist, but Electron runtime failed before verification.                                                            |
| AI Decision Engine | PARTIAL         | PARTIAL         | PASS            | PARTIAL         | PARTIAL         | PASS            | Existing decision-engine tests plus coverage run execute deterministic/heuristic decision paths. No ML or external AI component was identified.                                                                                                    |
| Event Bus          | PARTIAL         | PARTIAL         | PASS            | PARTIAL         | NOT_TESTED      | PARTIAL         | In-memory event bus is used by API registration and package tests; cross-process propagation to Electron is not live-verified.                                                                                                                     |
| Observability      | PARTIAL         | PARTIAL         | PASS            | PARTIAL         | NOT_TESTED      | PARTIAL         | API `/api/v1/metrics` route and network telemetry hooks exist; runtime health endpoints were queried. Trace/log pipeline was not end-to-end verified.                                                                                              |
| Cross-System E2E   | FAIL            | PARTIAL         | FAIL            | PARTIAL         | NOT_TESTED      | PARTIAL         | Backend starts and exposes health; chain stops before Electron/UI because Electron cannot load native GTK dependency in this environment and backend does not wire DNS/routing/tunnel/AI as live services.                                         |

## Electron Page Verification

| Page      | Status      | Evidence                                |
| --------- | ----------- | --------------------------------------- |
| Dashboard | UNAVAILABLE | Electron failed before window creation. |
| Network   | UNAVAILABLE | Electron failed before window creation. |
| Security  | UNAVAILABLE | Electron failed before window creation. |
| Tunnels   | UNAVAILABLE | Electron failed before window creation. |
| DNS       | UNAVAILABLE | Electron failed before window creation. |
| Decisions | UNAVAILABLE | Electron failed before window creation. |
| Settings  | UNAVAILABLE | Electron failed before window creation. |

## Runtime Command Evidence

- `pnpm --dir apps/api start`: PASS for startup on port 8080 after build.
- `curl -fsS http://127.0.0.1:8080/api/v1/health`: PASS.
- `curl -fsS http://127.0.0.1:8080/api/v1/ready`: PASS.
- `curl -fsS http://127.0.0.1:8080/api/v1/health/network`: PASS, but returned `status: unhealthy` with no measurements.
- `timeout 12s pnpm --dir apps/desktop dev`: FAIL before Electron main startup: missing `libatk-1.0.so.0`.

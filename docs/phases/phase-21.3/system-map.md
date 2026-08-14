# Phase 21.3 System Map

## Actual runtime architecture

| Edge                                      | Status          | Evidence                                                                                                           | Notes                                                       |
| ----------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Electron renderer -> preload -> typed IPC | LIVE            | Preload exposes only the typed `platform` bridge; renderer calls the bridge.                                       | No raw `ipcRenderer` is exposed.                            |
| IPC / Local Control -> Backend            | LIVE            | Desktop LIVE mode uses `BackendConnector` against `/api/v1/platform/status`.                                       | DEMO mode remains explicit through `IRP_DESKTOP_MODE=DEMO`. |
| Backend -> Core Services                  | LIVE            | Fastify constructs auth, RBAC, queue, database client, event bus, telemetry, and network monitor.                  | Database readiness degrades safely when unavailable.        |
| Core Services -> Connectivity             | LIVE            | `NetworkMonitoringService` runs safe probes and stores measurements.                                               | Host network changes are not performed.                     |
| Connectivity -> Routing                   | PARTIAL         | Backend exposes observe-only routing status derived from system-default route.                                     | No destructive route execution is implemented.              |
| Routing -> DNS                            | PARTIAL         | DNS latency appears through network probes.                                                                        | Smart DNS engine remains package-level.                     |
| DNS -> Secure DNS                         | PARTIAL         | `@irp/dns` contains DoH/DoT implementation, but backend marks secure transport `NOT_IMPLEMENTED` until registered. | This avoids false LIVE claims.                              |
| Secure DNS -> Recovery                    | PARTIAL         | DNS probe failures are surfaced in recovery/issues.                                                                | Secure DNS fallback is not live.                            |
| Recovery -> Tunnel                        | NOT_IMPLEMENTED | No real tunnel provider is configured or started.                                                                  | UI/backend return an empty live tunnel set.                 |
| Tunnel -> Security                        | PARTIAL         | Security state includes live probe-derived violations only.                                                        | Enforcement is observe-only.                                |
| Security -> Decision Engine               | LIVE            | Backend produces deterministic recommendations from live network score.                                            | It is not labeled ML.                                       |
| Decision Engine -> Event Bus              | PARTIAL         | Event bus is in-process; API publishes auth events.                                                                | It is not marketed as cross-process.                        |
| Event Bus -> Observability                | LIVE            | Network telemetry is recorded and Prometheus metrics are exposed.                                                  | Event bus metrics are limited.                              |
| Observability -> Kernel / Platform        | PARTIAL         | Runtime status and metrics are observable through API; kernel/platform integration remains package-level.          | No privileged platform operations are invoked.              |

## Runtime flow

```text
Electron renderer
  -> preload typed bridge
  -> main-process IPC allowlist
  -> BackendConnector HTTP client
  -> Fastify /api/v1/platform/status
  -> NetworkMonitoringService safe probes
  -> telemetry + deterministic status mapping
  -> Electron UI status cards
```

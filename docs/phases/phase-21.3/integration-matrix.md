# Phase 21.3 Integration Matrix

| Producer                      | Consumer         | Interface                                                 | Runtime                  | Test                    | Status          |
| ----------------------------- | ---------------- | --------------------------------------------------------- | ------------------------ | ----------------------- | --------------- |
| Backend                       | Electron         | HTTP `/api/v1/platform/status` via main-process connector | LIVE                     | API + desktop typecheck | PARTIAL         |
| Connectivity (`@irp/network`) | Backend          | `NetworkMonitoringService`                                | LIVE                     | API network tests       | LIVE            |
| Network Intelligence          | Backend          | none active                                               | Package-level            | package tests only      | PARTIAL         |
| Routing                       | Backend/Electron | observe-only status                                       | LIVE read-only           | status contract         | PARTIAL         |
| DNS                           | Backend          | network DNS latency probe                                 | LIVE                     | API network tests       | PARTIAL         |
| Secure DNS                    | Backend/Electron | status field only                                         | NOT_IMPLEMENTED          | docs/status             | DISCONNECTED    |
| Recovery                      | Backend/Electron | probe issues/recovery summary                             | LIVE partial             | API status test         | PARTIAL         |
| Tunnel                        | Backend/Electron | empty live tunnel status                                  | NOT_IMPLEMENTED provider | API status test         | NOT_IMPLEMENTED |
| Security                      | Backend/Electron | live status projection                                    | LIVE observe-only        | API status test         | PARTIAL         |
| AI/Decision                   | Backend/Electron | deterministic status projection                           | LIVE                     | API status test         | PARTIAL         |
| Event Bus                     | Backend          | in-process `InMemoryEventBus`                             | LIVE in-process          | auth event path         | PARTIAL         |
| Observability                 | Backend          | telemetry metrics                                         | LIVE                     | metrics route/build     | LIVE            |

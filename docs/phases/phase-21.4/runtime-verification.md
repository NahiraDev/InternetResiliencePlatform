# Phase 21.4 Runtime Verification

| Subsystem          | Startup         | Initialization  | Happy path                               | Failure                           | Recovery        | Shutdown                     | Status          |
| ------------------ | --------------- | --------------- | ---------------------------------------- | --------------------------------- | --------------- | ---------------------------- | --------------- |
| Backend API        | NOT_TESTED      | NOT_TESTED      | NOT_TESTED                               | NOT_TESTED                        | NOT_TESTED      | NOT_TESTED                   | PARTIAL         |
| Network monitoring | NOT_TESTED      | NOT_TESTED      | NOT_TESTED                               | NOT_TESTED                        | NOT_TESTED      | NOT_TESTED                   | PARTIAL         |
| DNS                | NOT_TESTED      | NOT_TESTED      | NOT_TESTED                               | NOT_TESTED                        | NOT_TESTED      | NOT_TESTED                   | PARTIAL         |
| Secure DNS         | NOT_TESTED      | NOT_TESTED      | NOT_TESTED                               | NOT_TESTED                        | NOT_TESTED      | NOT_TESTED                   | PARTIAL         |
| Routing            | NOT_TESTED      | NOT_TESTED      | PASS package simulation from prior tests | PARTIAL                           | PARTIAL         | NOT_TESTED                   | PARTIAL         |
| Recovery           | NOT_TESTED      | NOT_TESTED      | PARTIAL                                  | PARTIAL                           | PARTIAL         | NOT_TESTED                   | PARTIAL         |
| Tunnel             | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED                          | PASS unsupported-provider honesty | NOT_IMPLEMENTED | NOT_IMPLEMENTED              | NOT_IMPLEMENTED |
| Electron           | NOT_TESTED      | NOT_TESTED      | NOT_TESTED                               | NOT_TESTED                        | NOT_TESTED      | NOT_TESTED                   | PARTIAL         |
| Event Bus          | PASS            | PASS            | PASS                                     | NOT_TESTED                        | NOT_APPLICABLE  | PASS cleanup via unsubscribe | PASS_IN_PROCESS |
| Queue              | PASS            | PASS            | PASS                                     | NOT_TESTED                        | NOT_TESTED      | NOT_TESTED                   | PASS_IN_MEMORY  |
| Telemetry          | PASS            | PASS            | PASS                                     | NOT_TESTED                        | NOT_APPLICABLE  | NOT_TESTED                   | PASS_PARTIAL    |

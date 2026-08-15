| Historical Defect                | Regression Test                                            | Current Status | Evidence                                  |
| -------------------------------- | ---------------------------------------------------------- | -------------- | ----------------------------------------- |
| Production JWT fallback          | Security phase 18 tests                                    | Protected      | `packages/security/src/phase18.test.ts`   |
| Electron DEMO leakage            | Desktop IPC/security/renderer tests                        | Protected      | `apps/desktop/test/*.test.ts`             |
| Missing platform status endpoint | API stabilization test                                     | Protected      | `apps/api/src/index.test.ts`              |
| Live network monitoring path     | Connectivity/network tests                                 | Protected      | `packages/connectivity/src/index.test.ts` |
| Events behavior                  | Event bus tests                                            | Protected      | `packages/events/src/index.test.ts`       |
| Shared contracts                 | Shared contract tests                                      | Protected      | `packages/shared/src/index.test.ts`       |
| Queue lifecycle                  | Queue lifecycle tests                                      | Protected      | `packages/queue/src/index.test.ts`        |
| Telemetry behavior               | Telemetry tests                                            | Protected      | `packages/telemetry/src/index.test.ts`    |
| Testless package false green     | Repository validator and strict scripts                    | Protected      | `scripts/validate-repository.mjs`         |
| Plugin package gaps              | Plugin API/config/events/registry/runtime/sdk/sample tests | Protected      | `packages/plugin-*/src/index.test.ts`     |
